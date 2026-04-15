"""
Motif detection: fingerprint subgraphs against known architectural patterns.

Each detector is a pure function (state) -> list[Motif]. Add new patterns by
writing a new detector and registering it in DETECTORS. Knowledge-base entries
in KNOWLEDGE map motif kinds to curated design rationale — that's what makes
Rocky's answers paper-grounded instead of generic.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Callable, Optional

from rocky.server.model_state import ModelState, NodeDetail

# ── Data model ──────────────────────────────────────────────────────────────

@dataclass
class Motif:
    kind: str                     # stable id, e.g. "inverted_residual"
    label: str                    # "Inverted Residual (MobileNetV2)"
    anchor: str                   # primary node name
    node_names: list[str]         # all nodes belonging to this motif
    meta: dict = field(default_factory=dict)  # pattern-specific stats


# ── Knowledge base ──────────────────────────────────────────────────────────
# Curated. These are the "why" behind each pattern — what a senior engineer
# would explain. Rocky cites this as context instead of hallucinating.

KNOWLEDGE: dict[str, dict] = {
    "inverted_residual": {
        "title": "Inverted Residual Block (MobileNetV2)",
        "paper": "Sandler et al., 'MobileNetV2: Inverted Residuals and Linear Bottlenecks', CVPR 2018",
        "section": "§3.3",
        "rationale": (
            "Expand channels first (1×1), do depthwise conv on the wide tensor, "
            "then project back down (1×1, linear). The intuition: the manifold "
            "of interest lives in a low-dimensional subspace of the activation "
            "space, so we keep the thin tensors as the 'highway' and do the "
            "expensive spatial filtering where channels are wide. ReLU destroys "
            "information in low-dim spaces, so the final 1×1 is deliberately "
            "linear (no activation). Residual connects the two thin endpoints."
        ),
        "common_variants": [
            "expansion_ratio 6 is the MobileNetV2 default; 3–4 for faster models",
            "Stride-2 variants drop the residual (shape mismatch)",
            "V3 adds SE block after the depthwise",
        ],
        "failure_modes": [
            "ReLU6 on the projected (thin) output collapses info — never do this",
            "BatchNorm momentum too high on the narrow stage hurts quantization",
        ],
    },
    # Future motifs land here — se_block, residual_bottleneck, attention_head, ffn, layernorm, ...
}


# ── Helpers ─────────────────────────────────────────────────────────────────

_ACT_OPS = {"Relu", "Relu6", "Clip", "HardSwish", "Sigmoid", "Tanh", "Gelu"}
_NORM_OPS = {"BatchNormalization", "LayerNormalization", "InstanceNormalization", "GroupNormalization"}
# Ops that produce weights/constants, not activations — skip when tracing data flow.
_WEIGHT_OPS = {"Identity", "Constant", "ConstantOfShape"}


def _data_prev(state: ModelState, node_name: str) -> list[str]:
    """Prev nodes filtered to the data-flow path (drop weight/constant producers)."""
    node = state.node_map.get(node_name)
    if not node:
        return []
    return [p for p in node.prev_nodes if state.node_map.get(p) and state.node_map[p].op_type not in _WEIGHT_OPS]


def _is_conv_kxk(node: NodeDetail, k: int) -> bool:
    if node.op_type != "Conv":
        return False
    kshape = node.attributes.get("kernel_shape")
    return isinstance(kshape, list) and all(d == k for d in kshape)


def _is_conv_1x1(node: NodeDetail) -> bool:
    return _is_conv_kxk(node, 1)


def _is_depthwise_conv(node: NodeDetail) -> bool:
    """Depthwise: groups == in_channels == out_channels (all == 1 per group)."""
    if node.op_type != "Conv":
        return False
    group = node.attributes.get("group", 1)
    if group == 1:
        return False
    # group matches the weight's out_channels: W shape is [out, in/group, kh, kw]
    for inp in node.inputs:
        if inp.get("is_weight") and inp.get("shape"):
            out_ch = inp["shape"][0]
            if out_ch == group:
                return True
    return False


def _skip_norm_act(state: ModelState, node_name: str) -> Optional[str]:
    """Walk backwards through optional norm/activation layers, return the
    first node whose op isn't a norm or activation. Returns None on fork."""
    current = node_name
    for _ in range(4):
        node = state.node_map.get(current)
        if not node:
            return None
        if node.op_type not in _NORM_OPS and node.op_type not in _ACT_OPS:
            return current
        prevs = _data_prev(state, current)
        if len(prevs) != 1:
            return None
        current = prevs[0]
    return current


# ── Detectors ───────────────────────────────────────────────────────────────

def detect_inverted_residual(state: ModelState) -> list[Motif]:
    """
    Pattern (MobileNetV2-style):
        x ──► Conv1×1 (expand) ──► norm/act? ──► Conv3×3 depthwise ──► norm/act? ──► Conv1×1 (project) ──► Add ◄── x
    The two 'x' legs of the Add are the same upstream tensor.
    """
    hits: list[Motif] = []
    for name, node in state.node_map.items():
        if node.op_type != "Add":
            continue
        data_legs = _data_prev(state, name)
        if len(data_legs) < 2:
            continue

        # Try each leg as the "project" (inverted-residual main path). The
        # residual skip leg can itself end in a 1×1 Conv from a previous block,
        # so just checking op type on the first leg isn't enough — we have to
        # validate the full expand → depthwise → project chain.
        project: Optional[str] = None
        before_proj: Optional[str] = None
        before_dw: Optional[str] = None
        proj_prevs_ok: list[str] = []
        dw_prevs_ok: list[str] = []

        for leg in data_legs:
            cand_project = _skip_norm_act(state, leg)
            if not cand_project or not _is_conv_1x1(state.node_map[cand_project]):
                continue
            cand_proj_prevs = _data_prev(state, cand_project)
            if len(cand_proj_prevs) != 1:
                continue
            cand_before_proj = _skip_norm_act(state, cand_proj_prevs[0])
            if not cand_before_proj or not _is_depthwise_conv(state.node_map[cand_before_proj]):
                continue
            cand_dw_prevs = _data_prev(state, cand_before_proj)
            if len(cand_dw_prevs) != 1:
                continue
            cand_before_dw = _skip_norm_act(state, cand_dw_prevs[0])
            if not cand_before_dw or not _is_conv_1x1(state.node_map[cand_before_dw]):
                continue
            # Full chain validated.
            project = cand_project
            before_proj = cand_before_proj
            before_dw = cand_before_dw
            proj_prevs_ok = cand_proj_prevs
            dw_prevs_ok = cand_dw_prevs
            break

        if not project:
            continue
        project_node = state.node_map[project]
        dw_candidate = state.node_map[before_proj]
        expand_candidate = state.node_map[before_dw]
        proj_prevs = proj_prevs_ok
        dw_prevs = dw_prevs_ok

        # Expansion factor = expand output channels / expand input channels
        expand_in = _conv_in_channels(expand_candidate)
        expand_out = _conv_out_channels(expand_candidate)
        project_out = _conv_out_channels(project_node)
        exp_ratio = (expand_out / expand_in) if expand_in else None

        # Build node list (all nodes we walked through)
        nodes = [name, project]
        nodes.extend(_walk_between(state, proj_prevs[0], before_proj))
        nodes.append(before_proj)  # depthwise
        nodes.extend(_walk_between(state, dw_prevs[0], before_dw))
        nodes.append(before_dw)  # expand
        # dedupe preserving order
        seen: set[str] = set()
        uniq = [n for n in nodes if not (n in seen or seen.add(n))]

        hits.append(Motif(
            kind="inverted_residual",
            label="Inverted Residual (MobileNetV2)",
            anchor=name,
            node_names=uniq,
            meta={
                "expansion_ratio": round(exp_ratio, 2) if exp_ratio else None,
                "channels_in": expand_in,
                "channels_mid": expand_out,
                "channels_out": project_out,
                "expand_node": before_dw,
                "depthwise_node": before_proj,
                "project_node": project,
            },
        ))
    return hits


def _conv_in_channels(node: NodeDetail) -> Optional[int]:
    # For Conv, weight shape is [out, in/group, kh, kw]; in_channels = in/group * group
    for inp in node.inputs:
        if inp.get("is_weight") and inp.get("shape") and len(inp["shape"]) >= 2:
            return int(inp["shape"][1]) * int(node.attributes.get("group", 1))
    return None


def _conv_out_channels(node: NodeDetail) -> Optional[int]:
    for inp in node.inputs:
        if inp.get("is_weight") and inp.get("shape") and len(inp["shape"]) >= 1:
            return int(inp["shape"][0])
    return None


def _walk_between(state: ModelState, start: str, end: str, limit: int = 4) -> list[str]:
    """Collect intermediate node names between start (inclusive) and end (exclusive)."""
    path: list[str] = []
    current = start
    for _ in range(limit):
        if current == end:
            return path
        node = state.node_map.get(current)
        if not node:
            return path
        prevs = _data_prev(state, current)
        if len(prevs) != 1:
            return path
        path.append(current)
        current = prevs[0]
    return path


# ── Registry + top-level API ────────────────────────────────────────────────

DETECTORS: list[Callable[[ModelState], list[Motif]]] = [
    detect_inverted_residual,
    # Future: detect_se_block, detect_residual_bottleneck, detect_attention_head, detect_ffn, ...
]


def detect_all(state: ModelState) -> list[Motif]:
    out: list[Motif] = []
    for fn in DETECTORS:
        try:
            out.extend(fn(state))
        except Exception as e:
            # Detectors shouldn't crash model loading; log and continue.
            print(f"[motifs] {fn.__name__} failed: {e}")
    return out


def build_node_index(motifs: list[Motif]) -> dict[str, list[int]]:
    """node_name -> list of indices into the motif list."""
    index: dict[str, list[int]] = {}
    for i, m in enumerate(motifs):
        for n in m.node_names:
            index.setdefault(n, []).append(i)
    return index


def motif_context_for_node(node_name: str, state: ModelState) -> Optional[str]:
    """Return a text block describing any motif the node participates in,
    including the curated knowledge-base entry. Used by the chat adapter."""
    motifs: list[Motif] = getattr(state, "motifs", []) or []
    if not motifs:
        return None
    index: dict[str, list[int]] = getattr(state, "motif_index", {}) or {}
    idxs = index.get(node_name, [])
    if not idxs:
        return None

    blocks: list[str] = []
    for i in idxs[:2]:  # rarely more than 1 per node
        m = motifs[i]
        kb = KNOWLEDGE.get(m.kind, {})
        meta_lines = [f"- {k}: {v}" for k, v in m.meta.items() if v is not None]
        role = "anchor" if node_name == m.anchor else "member"
        block = (
            f"MOTIF: {m.label}\n"
            f"- role of selected node: {role}\n"
            + ("\n".join(meta_lines) + "\n" if meta_lines else "")
            + (f"- paper: {kb.get('paper')}\n" if kb.get('paper') else "")
            + (f"- section: {kb.get('section')}\n" if kb.get('section') else "")
            + (f"- rationale: {kb.get('rationale')}\n" if kb.get('rationale') else "")
        )
        blocks.append(block.strip())
    return "\n\n".join(blocks)


def motifs_to_dict(motifs: list[Motif]) -> list[dict]:
    return [asdict(m) for m in motifs]
