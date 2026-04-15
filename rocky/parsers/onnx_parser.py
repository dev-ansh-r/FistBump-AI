"""ONNX model → unified graph JSON + node map."""

import onnx
import numpy as np
from onnx import numpy_helper, TensorProto
from rocky.server.model_state import ModelState, ModelSummary, NodeDetail

DTYPE_MAP = {
    TensorProto.FLOAT: "float32",
    TensorProto.DOUBLE: "float64",
    TensorProto.INT32: "int32",
    TensorProto.INT64: "int64",
    TensorProto.INT8: "int8",
    TensorProto.UINT8: "uint8",
    TensorProto.BOOL: "bool",
    TensorProto.STRING: "string",
    TensorProto.FLOAT16: "float16",
}


def parse_onnx(path: str, state: ModelState) -> ModelSummary:
    """
    Load an ONNX model, populate state.node_map and state.summary.
    Returns the ModelSummary.
    """
    model = onnx.load(path)
    onnx.checker.check_model(model)
    # Run shape inference so intermediate tensor shapes are populated
    # (PyTorch dynamic-axis exports often omit value_info for hidden tensors)
    try:
        model = onnx.shape_inference.infer_shapes(model)
    except Exception:
        pass  # best-effort; continue with whatever shapes exist
    graph = model.graph

    # Build initializer lookup (weights)
    initializers = {init.name: init for init in graph.initializer}

    # Build value_info lookup for intermediate tensor shapes
    shape_map = {}
    for vi in list(graph.input) + list(graph.output) + list(graph.value_info):
        shape = []
        dtype = None
        if vi.type.HasField("tensor_type"):
            tt = vi.type.tensor_type
            dtype = DTYPE_MAP.get(tt.elem_type, "unknown")
            if tt.HasField("shape"):
                for dim in tt.shape.dim:
                    if dim.HasField("dim_value"):
                        shape.append(dim.dim_value)
                    elif dim.HasField("dim_param"):
                        shape.append(dim.dim_param)  # dynamic dim e.g. "batch"
                    else:
                        shape.append("?")
        shape_map[vi.name] = {"shape": shape, "dtype": dtype}

    # Build producer/consumer maps for connectivity
    producer_map: dict[str, str] = {}    # tensor_name → node_name
    consumer_map: dict[str, list[str]] = {}  # tensor_name → [node_names]

    # Assign stable names to all nodes first
    node_names: list[str] = []
    name_counts: dict[str, int] = {}
    for node in graph.node:
        if node.name:
            node_name = node.name
        else:
            count = name_counts.get(node.op_type, 0)
            node_name = f"{node.op_type}_{count}"
            name_counts[node.op_type] = count + 1
        node_names.append(node_name)

    for node, node_name in zip(graph.node, node_names):
        for out in node.output:
            if out:
                producer_map[out] = node_name
        for inp in node.input:
            if inp:
                consumer_map.setdefault(inp, []).append(node_name)

    # Count parameters
    total_params = 0
    for init in graph.initializer:
        arr = numpy_helper.to_array(init)
        total_params += arr.size

    # Build op histogram
    op_histogram: dict[str, int] = {}
    for node in graph.node:
        op_histogram[node.op_type] = op_histogram.get(node.op_type, 0) + 1

    # Build node_map
    node_map: dict[str, NodeDetail] = {}
    for node, node_name in zip(graph.node, node_names):
        inputs = []
        for inp in node.input:
            if not inp:
                continue
            if inp in initializers:
                arr = numpy_helper.to_array(initializers[inp])
                inputs.append({
                    "name": inp,
                    "shape": list(arr.shape),
                    "dtype": str(arr.dtype),
                    "is_weight": True,
                })
            else:
                info = shape_map.get(inp, {})
                inputs.append({
                    "name": inp,
                    "shape": info.get("shape", []),
                    "dtype": info.get("dtype"),
                    "is_weight": False,
                })

        outputs = []
        for out in node.output:
            if not out:
                continue
            info = shape_map.get(out, {})
            outputs.append({
                "name": out,
                "shape": info.get("shape", []),
                "dtype": info.get("dtype"),
            })

        attributes = {}
        for attr in node.attribute:
            attributes[attr.name] = _extract_attr(attr)

        weight_shapes = {
            inp: list(numpy_helper.to_array(initializers[inp]).shape)
            for inp in node.input
            if inp and inp in initializers
        }

        prev_nodes = list({
            producer_map[inp]
            for inp in node.input
            if inp and inp in producer_map
        })
        next_nodes = list({
            n
            for out in node.output
            for n in consumer_map.get(out, [])
            if out
        })

        node_map[node_name] = NodeDetail(
            name=node_name,
            op_type=node.op_type,
            inputs=inputs,
            outputs=outputs,
            attributes=attributes,
            weight_shapes=weight_shapes,
            prev_nodes=prev_nodes,
            next_nodes=next_nodes,
        )

    # Build summary
    graph_inputs = [
        {"name": inp.name, **shape_map.get(inp.name, {})}
        for inp in graph.input
        if inp.name not in initializers
    ]
    graph_outputs = [
        {"name": out.name, **shape_map.get(out.name, {})}
        for out in graph.output
    ]

    summary = ModelSummary(
        path=path,
        format="onnx",
        name=model.graph.name or path.split("/")[-1].split("\\")[-1],
        n_nodes=len(graph.node),
        n_params=total_params,
        inputs=graph_inputs,
        outputs=graph_outputs,
        op_histogram=op_histogram,
    )

    state.model = model
    state.node_map = node_map
    state.summary = summary
    state.model_path = path

    # Detect architectural motifs (inverted residual, etc.) — Phase 3
    try:
        from rocky.server.motifs import detect_all, build_node_index
        state.motifs = detect_all(state)
        state.motif_index = build_node_index(state.motifs)
    except Exception as e:
        print(f"[motifs] detection failed: {e}")
        state.motifs = []
        state.motif_index = {}

    return summary


def _extract_attr(attr):
    """Convert ONNX attribute proto to a Python primitive."""
    from onnx import AttributeProto
    if attr.type == AttributeProto.INT:
        return attr.i
    elif attr.type == AttributeProto.FLOAT:
        return attr.f
    elif attr.type == AttributeProto.STRING:
        return attr.s.decode("utf-8")
    elif attr.type == AttributeProto.INTS:
        return list(attr.ints)
    elif attr.type == AttributeProto.FLOATS:
        return list(attr.floats)
    elif attr.type == AttributeProto.TENSOR:
        arr = numpy_helper.to_array(attr.t)
        return {"shape": list(arr.shape), "dtype": str(arr.dtype)}
    return str(attr)
