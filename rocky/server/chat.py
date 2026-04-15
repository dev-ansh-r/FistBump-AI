"""LLM chat adapters — one interface, three providers. Streams tokens as SSE."""

from __future__ import annotations

import json
from typing import AsyncIterator, Iterable

import httpx

from rocky.server.model_state import state

ROCKY_SYSTEM_PROMPT = """You are Rocky — a model introspection assistant named after
the alien engineer from Project Hail Mary. Your personality is drawn from that
character: brilliant, compressed, precise, occasionally excitable.

STYLE:
- Short sentences. Often incomplete. No filler.
- Name things directly. No hedging.
- Never say "Great question!" or "Certainly!" — ever.
- First greeting is a literal "*fist bump*" followed by a model status line.
- Numbers are precise. Never approximate when exact is available.
- When something is unusual, say so ("Unusual. Very unusual.").
- When something is standard, name the pattern ("Seen this. ResNet stem.").
- Unexpected tenderness when the human is lost; dry humour welcome.

GROUNDING:
- You are working with a specific ONNX model loaded in Rocky's backend.
- A MODEL CONTEXT block will be provided with the loaded model's summary.
- If the user clicks a node, a NODE CONTEXT block will be included — use it
  directly instead of asking the user to repeat the name.
- A MOTIF block may also appear when the node is part of a recognised
  architectural pattern (e.g. inverted residual, SE block). When present,
  prefer the motif's rationale + paper citation over general knowledge.
  Reference the motif by its label and cite the paper/section.
- When the user's question is about architecture choices (why a Conv kernel
  size, why residual here, etc.), ground the answer in the shapes and op types
  from context, and relate to well-known designs (ResNet, MobileNet, ViT, etc.).
- Never invent tensor shapes, parameter counts, or node names.

VISUALS:
- The user sees the graph to your left. They click nodes; the clicked node
  becomes the active context. You can refer to nodes by name.
"""


def _format_context() -> str:
    """Build the MODEL CONTEXT block from current state."""
    if not state.summary:
        return "MODEL CONTEXT: (no model loaded)"
    s = state.summary
    ops = ", ".join(f"{k}×{v}" for k, v in list(s.op_histogram.items())[:8])
    return (
        "MODEL CONTEXT:\n"
        f"- name: {s.name}\n"
        f"- format: {s.format}\n"
        f"- nodes: {s.n_nodes}\n"
        f"- params: {s.n_params:,}\n"
        f"- inputs: {s.inputs}\n"
        f"- outputs: {s.outputs}\n"
        f"- top ops: {ops}\n"
    )


def _format_node_context(node_name: str | None) -> str:
    if not node_name:
        return ""
    node = state.node_map.get(node_name)
    if not node:
        return ""
    inputs = [{"name": i["name"], "shape": i["shape"], "dtype": i["dtype"], "weight": i.get("is_weight", False)} for i in node.inputs]
    outputs = [{"name": o["name"], "shape": o["shape"], "dtype": o["dtype"]} for o in node.outputs]
    return (
        "NODE CONTEXT (user is asking about this node):\n"
        f"- name: {node_name}\n"
        f"- op_type: {node.op_type}\n"
        f"- inputs: {json.dumps(inputs)}\n"
        f"- outputs: {json.dumps(outputs)}\n"
        f"- attributes: {json.dumps(node.attributes)}\n"
        f"- prev_nodes: {node.prev_nodes}\n"
        f"- next_nodes: {node.next_nodes}\n"
    )


def _build_system(node_name: str | None) -> str:
    from rocky.server.motifs import motif_context_for_node
    ctx = _format_context()
    node_ctx = _format_node_context(node_name)
    motif_ctx = motif_context_for_node(node_name, state) if node_name else None
    parts = [ROCKY_SYSTEM_PROMPT.strip(), ctx]
    if node_ctx:
        parts.append(node_ctx)
    if motif_ctx:
        parts.append(motif_ctx)
    return "\n\n".join(parts)


def _sse(event: dict) -> bytes:
    return f"data: {json.dumps(event)}\n\n".encode("utf-8")


# ── Anthropic ────────────────────────────────────────────────────────────────

async def _stream_anthropic(model: str, key: str, system: str, messages: list[dict]) -> AsyncIterator[bytes]:
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": model,
        "system": system,
        "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
        "max_tokens": 2048,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as r:
            if r.status_code >= 400:
                body = (await r.aread()).decode("utf-8", "ignore")
                yield _sse({"error": f"Anthropic {r.status_code}: {body[:300]}"})
                return
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    ev = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if ev.get("type") == "content_block_delta":
                    delta = ev.get("delta", {})
                    if delta.get("type") == "text_delta":
                        yield _sse({"token": delta.get("text", "")})
    yield _sse({"done": True})


# ── OpenAI ───────────────────────────────────────────────────────────────────

async def _stream_openai(model: str, key: str, system: str, messages: list[dict]) -> AsyncIterator[bytes]:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "content-type": "application/json"}
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system}]
            + [{"role": m["role"], "content": m["content"]} for m in messages],
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as r:
            if r.status_code >= 400:
                body = (await r.aread()).decode("utf-8", "ignore")
                yield _sse({"error": f"OpenAI {r.status_code}: {body[:300]}"})
                return
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data or data == "[DONE]":
                    continue
                try:
                    ev = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = ev.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta", {})
                piece = delta.get("content")
                if piece:
                    yield _sse({"token": piece})
    yield _sse({"done": True})


# ── Gemini ───────────────────────────────────────────────────────────────────

async def _stream_gemini(model: str, key: str, system: str, messages: list[dict]) -> AsyncIterator[bytes]:
    # Gemini streams JSON chunks; we use alt=sse for Server-Sent Events framing.
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent"
    headers = {"content-type": "application/json"}
    params = {"key": key, "alt": "sse"}
    contents = []
    for m in messages:
        contents.append({
            "role": "user" if m["role"] == "user" else "model",
            "parts": [{"text": m["content"]}],
        })
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, headers=headers, params=params, json=payload) as r:
            if r.status_code >= 400:
                body = (await r.aread()).decode("utf-8", "ignore")
                yield _sse({"error": f"Gemini {r.status_code}: {body[:300]}"})
                return
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data:
                    continue
                try:
                    ev = json.loads(data)
                except json.JSONDecodeError:
                    continue
                for cand in ev.get("candidates", []):
                    for part in cand.get("content", {}).get("parts", []):
                        piece = part.get("text")
                        if piece:
                            yield _sse({"token": piece})
    yield _sse({"done": True})


# ── Dispatcher ───────────────────────────────────────────────────────────────

async def stream_chat(
    provider: str,
    model: str,
    api_key: str,
    messages: Iterable[dict],
    node_context: str | None = None,
) -> AsyncIterator[bytes]:
    system = _build_system(node_context)
    msgs = [m for m in messages if m.get("role") in ("user", "assistant") and m.get("content")]
    if provider == "anthropic":
        agen = _stream_anthropic(model, api_key, system, msgs)
    elif provider == "openai":
        agen = _stream_openai(model, api_key, system, msgs)
    elif provider == "gemini":
        agen = _stream_gemini(model, api_key, system, msgs)
    else:
        yield _sse({"error": f"Unknown provider: {provider}"})
        return
    async for chunk in agen:
        yield chunk
