"""HTTP API consumed by the Tauri desktop app."""

from dataclasses import asdict
from pathlib import Path

from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from rocky.server.model_state import state

app = FastAPI(title="Rocky Backend")

# CORS only matters in dev mode (Vite on a different port). Tauri webview is same-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "http://127.0.0.1:1420", "tauri://localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoadRequest(BaseModel):
    path: str


@app.post("/api/load")
def load_model(req: LoadRequest):
    """Parse a model from disk and replace current state."""
    p = Path(req.path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {p}")
    if p.suffix.lower() != ".onnx":
        raise HTTPException(status_code=400, detail=f"Unsupported format: {p.suffix}")

    state.clear()
    try:
        from rocky.parsers.onnx_parser import parse_onnx
        parse_onnx(str(p), state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse failed: {e}")

    return asdict(state.summary)


@app.get("/api/summary")
def get_summary():
    if not state.summary:
        raise HTTPException(status_code=404, detail="No model loaded")
    return asdict(state.summary)


@app.get("/api/graph")
def get_graph():
    if not state.node_map:
        return {"nodes": [], "edges": []}
    nodes, edges = [], []
    for name, node in state.node_map.items():
        nodes.append({
            "id": name,
            "data": {
                "label": name,
                "op_type": node.op_type,
                "output_shapes": [o["shape"] for o in node.outputs],
            },
            "type": "rocky_node",
        })
        for nxt in node.next_nodes:
            edges.append({"id": f"{name}->{nxt}", "source": name, "target": nxt})
    return {"nodes": nodes, "edges": edges}


@app.get("/api/node")
def get_node(name: str):
    node = state.node_map.get(name)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node '{name}' not found")
    result = asdict(node)
    # Attach motif membership so the UI can show a "part of X" badge
    idxs = state.motif_index.get(name, [])
    if idxs:
        from rocky.server.motifs import KNOWLEDGE
        motifs_here = []
        for i in idxs:
            if i < len(state.motifs):
                m = state.motifs[i]
                motifs_here.append({
                    "kind": m.kind,
                    "label": m.label,
                    "anchor": m.anchor,
                    "is_anchor": m.anchor == name,
                    "meta": m.meta,
                    "knowledge": KNOWLEDGE.get(m.kind, {}),
                })
        result["motifs"] = motifs_here
    else:
        result["motifs"] = []
    return result


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    provider: str
    model: str
    api_key: str
    messages: List[ChatMessage]
    node_context: Optional[str] = None


@app.post("/api/chat")
async def chat(req: ChatRequest):
    from rocky.server.chat import stream_chat
    gen = stream_chat(
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
        messages=[m.model_dump() for m in req.messages],
        node_context=req.node_context,
    )
    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/motifs")
def get_motifs():
    """Return all detected motifs + a node-to-motifs index."""
    from rocky.server.motifs import motifs_to_dict, KNOWLEDGE
    return {
        "motifs": motifs_to_dict(state.motifs),
        "index": state.motif_index,
        "knowledge": KNOWLEDGE,
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model_loaded": state.summary is not None,
        "model_name": state.summary.name if state.summary else None,
    }
