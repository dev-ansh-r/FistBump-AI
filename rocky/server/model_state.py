"""Thread-safe singleton holding loaded model and UI selection state."""

from dataclasses import dataclass, field
from typing import Optional
import threading


@dataclass
class NodeDetail:
    name: str
    op_type: str
    inputs: list[dict]       # [{name, shape, dtype, is_weight}]
    outputs: list[dict]      # [{name, shape, dtype}]
    attributes: dict
    weight_shapes: dict      # initializer tensors connected to this node
    prev_nodes: list[str]
    next_nodes: list[str]


@dataclass
class ModelSummary:
    path: str
    format: str              # "onnx" | "dlc"
    name: str
    n_nodes: int
    n_params: int
    inputs: list[dict]
    outputs: list[dict]
    op_histogram: dict[str, int]   # {"Conv": 42, "Relu": 41, ...}


class ModelState:
    """Thread-safe singleton holding loaded model and UI selection state."""

    _lock = threading.Lock()

    def __init__(self):
        self.model = None                       # parsed onnx.ModelProto
        self.summary: Optional[ModelSummary] = None
        self.node_map: dict[str, NodeDetail] = {}
        self.selected_node: Optional[str] = None
        self.model_path: Optional[str] = None
        self.motifs: list = []                  # list[motifs.Motif]
        self.motif_index: dict[str, list[int]] = {}   # node_name -> motif indices

    def set_selected(self, node_name: str):
        with self._lock:
            self.selected_node = node_name

    def get_selected(self) -> Optional[str]:
        with self._lock:
            return self.selected_node

    def clear(self):
        with self._lock:
            self.model = None
            self.summary = None
            self.node_map = {}
            self.selected_node = None
            self.model_path = None
            self.motifs = []
            self.motif_index = {}


# Global singleton — shared by MCP tools and REST API
state = ModelState()
