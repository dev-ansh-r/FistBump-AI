"""Tests for MCP tool functions."""

import pytest
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper
from rocky.server.model_state import ModelState
from rocky.parsers.onnx_parser import parse_onnx


def _load_test_model(tmp_path) -> ModelState:
    X = helper.make_tensor_value_info("X", TensorProto.FLOAT, [1, 3, 224, 224])
    Y = helper.make_tensor_value_info("Y", TensorProto.FLOAT, [1, 64, 112, 112])
    W = numpy_helper.from_array(
        np.random.randn(64, 3, 7, 7).astype(np.float32), name="conv_weight"
    )
    conv = helper.make_node(
        "Conv", inputs=["X", "conv_weight"], outputs=["conv_out"],
        name="stem_conv", kernel_shape=[7, 7], strides=[2, 2], pads=[3, 3, 3, 3],
    )
    relu = helper.make_node(
        "Relu", inputs=["conv_out"], outputs=["Y"], name="stem_relu",
    )
    graph = helper.make_graph([conv, relu], "test_model", [X], [Y], [W])
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8
    path = str(tmp_path / "test.onnx")
    onnx.save(model, path)
    state = ModelState()
    parse_onnx(path, state)
    return state


def test_get_model_summary_no_model():
    from rocky.server import model_state as ms
    original = ms.state.summary
    ms.state.summary = None

    # Import tool functions directly (bypassing FastMCP decorator)
    import importlib
    import rocky.server.tools as tools_mod

    # Patch global state temporarily
    original_state = tools_mod.state
    tools_mod.state = ms.ModelState()

    result = tools_mod.rocky_get_model_summary()
    assert "error" in result

    tools_mod.state = original_state
    ms.state.summary = original


def test_search_nodes(tmp_path):
    import rocky.server.tools as tools_mod
    state = _load_test_model(tmp_path)

    original_state = tools_mod.state
    tools_mod.state = state

    results = tools_mod.rocky_search_nodes(op_type="Conv")
    assert len(results) == 1
    assert results[0]["name"] == "stem_conv"

    results_all = tools_mod.rocky_search_nodes()
    assert len(results_all) == 2

    tools_mod.state = original_state


def test_get_subgraph(tmp_path):
    import rocky.server.tools as tools_mod
    state = _load_test_model(tmp_path)

    original_state = tools_mod.state
    tools_mod.state = state

    result = tools_mod.rocky_get_subgraph("stem_conv", depth=1)
    node_names = {n["name"] for n in result["nodes"]}
    assert "stem_conv" in node_names
    assert "stem_relu" in node_names
    assert result["focus"] == "stem_conv"

    tools_mod.state = original_state


def test_highlight_node(tmp_path):
    import rocky.server.tools as tools_mod
    state = _load_test_model(tmp_path)

    original_state = tools_mod.state
    tools_mod.state = state

    result = tools_mod.rocky_highlight_node("stem_relu")
    assert result["status"] == "ok"
    assert state.get_selected() == "stem_relu"

    bad = tools_mod.rocky_highlight_node("nonexistent_node")
    assert "error" in bad

    tools_mod.state = original_state
