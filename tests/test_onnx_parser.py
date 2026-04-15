"""Tests for the ONNX parser."""

import pytest
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper
from rocky.server.model_state import ModelState
from rocky.parsers.onnx_parser import parse_onnx


def _make_simple_model(tmp_path) -> str:
    """Build a tiny Conv → Relu ONNX model for testing."""
    # Inputs
    X = helper.make_tensor_value_info("X", TensorProto.FLOAT, [1, 3, 224, 224])
    Y = helper.make_tensor_value_info("Y", TensorProto.FLOAT, [1, 64, 112, 112])

    # Weight initializer
    W = numpy_helper.from_array(
        np.random.randn(64, 3, 7, 7).astype(np.float32), name="conv_weight"
    )
    B = numpy_helper.from_array(
        np.zeros(64, dtype=np.float32), name="conv_bias"
    )

    # Nodes
    conv = helper.make_node(
        "Conv", inputs=["X", "conv_weight", "conv_bias"], outputs=["conv_out"],
        name="stem_conv", kernel_shape=[7, 7], strides=[2, 2], pads=[3, 3, 3, 3],
    )
    relu = helper.make_node(
        "Relu", inputs=["conv_out"], outputs=["Y"], name="stem_relu",
    )

    graph = helper.make_graph([conv, relu], "test_model", [X], [Y], [W, B])
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8

    path = str(tmp_path / "test.onnx")
    onnx.save(model, path)
    return path


def test_parse_onnx_summary(tmp_path):
    path = _make_simple_model(tmp_path)
    state = ModelState()
    summary = parse_onnx(path, state)

    assert summary.format == "onnx"
    assert summary.n_nodes == 2
    assert summary.op_histogram == {"Conv": 1, "Relu": 1}
    assert summary.n_params == 64 * 3 * 7 * 7 + 64  # weights + bias


def test_parse_onnx_node_map(tmp_path):
    path = _make_simple_model(tmp_path)
    state = ModelState()
    parse_onnx(path, state)

    assert "stem_conv" in state.node_map
    assert "stem_relu" in state.node_map

    conv_node = state.node_map["stem_conv"]
    assert conv_node.op_type == "Conv"
    assert conv_node.attributes["kernel_shape"] == [7, 7]
    assert conv_node.attributes["strides"] == [2, 2]
    assert "conv_weight" in conv_node.weight_shapes
    assert conv_node.weight_shapes["conv_weight"] == [64, 3, 7, 7]


def test_parse_onnx_connectivity(tmp_path):
    path = _make_simple_model(tmp_path)
    state = ModelState()
    parse_onnx(path, state)

    conv_node = state.node_map["stem_conv"]
    relu_node = state.node_map["stem_relu"]

    # Conv → Relu connectivity
    assert "stem_relu" in conv_node.next_nodes
    assert "stem_conv" in relu_node.prev_nodes


def test_model_state_selected(tmp_path):
    path = _make_simple_model(tmp_path)
    state = ModelState()
    parse_onnx(path, state)

    assert state.get_selected() is None
    state.set_selected("stem_conv")
    assert state.get_selected() == "stem_conv"
