import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type NodeMouseHandler,
  type Node,
  type Edge,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import type { RockyNode, RockyEdge } from '../hooks/useModel'

// Op type → colour mapping
const OP_COLOUR: Record<string, string> = {
  // Convolutions — blue
  Conv: '#3b82f6',
  ConvTranspose: '#3b82f6',
  ConvInteger: '#3b82f6',
  // Normalization — purple
  BatchNormalization: '#8b5cf6',
  LayerNormalization: '#8b5cf6',
  SkipLayerNormalization: '#8b5cf6',
  GroupNormalization: '#8b5cf6',
  InstanceNormalization: '#8b5cf6',
  // Activations — green
  Relu: '#10b981',
  Gelu: '#10b981',
  FastGelu: '#10b981',
  Sigmoid: '#10b981',
  Tanh: '#10b981',
  HardSwish: '#10b981',
  HardSigmoid: '#10b981',
  LeakyRelu: '#10b981',
  Silu: '#10b981',
  Clip: '#10b981',
  // Pooling — amber
  MaxPool: '#f59e0b',
  AveragePool: '#f59e0b',
  GlobalAveragePool: '#f59e0b',
  ReduceMean: '#f59e0b',
  ReduceSum: '#f59e0b',
  // Matrix / attention — red
  MatMul: '#ef4444',
  MatMulInteger: '#ef4444',
  FusedMatMul: '#ef4444',
  Gemm: '#ef4444',
  Attention: '#ef4444',
  MultiHeadAttention: '#ef4444',
  Softmax: '#ef4444',
  LogSoftmax: '#ef4444',
  // Recurrent — pink
  LSTM: '#ec4899',
  GRU: '#ec4899',
  RNN: '#ec4899',
  DynamicQuantizeLSTM: '#ec4899',
  // Residual / scaling — cyan
  Add: '#06b6d4',
  Mul: '#06b6d4',
  // Audio / signal
  STFT: '#14b8a6',
  Resize: '#14b8a6',
  // Infrastructure — dim (hidden in semantic mode)
  Concat: '#334155',
  Reshape: '#334155',
  Transpose: '#334155',
  Flatten: '#334155',
  Squeeze: '#334155',
  Unsqueeze: '#334155',
  Constant: '#1e293b',
  Identity: '#1e293b',
  Shape: '#1e293b',
  Gather: '#1e293b',
  Cast: '#1e293b',
}

// Ops that carry no architectural meaning — hidden in semantic mode
const INFRA_OPS = new Set([
  'Shape', 'Gather', 'GatherElements', 'GatherND',
  'Unsqueeze', 'Squeeze', 'Reshape', 'Transpose', 'Flatten',
  'Concat', 'Split', 'Slice', 'Expand', 'Pad',
  'Cast', 'DequantizeLinear', 'DynamicQuantizeLinear', 'QuantizeLinear',
  'Constant', 'Identity', 'ConstantOfShape',
  'Floor', 'Ceil', 'Round', 'Sqrt', 'Div', 'Sub', 'Pow', 'Exp', 'Log',
  'Sin', 'Cos', 'Tan', 'Atan',
  'Equal', 'Where', 'Less', 'LessOrEqual', 'Greater', 'GreaterOrEqual',
  'And', 'Or', 'Not',
  'Range', 'CumSum', 'NonZero', 'ScatterND',
])

const NODE_W = 180
const NODE_H = 48

function getOpColour(opType: string): string {
  return OP_COLOUR[opType] ?? '#475569'
}

type FilterMode = 'semantic' | 'all'

function filterGraph(
  nodes: RockyNode[],
  edges: RockyEdge[],
  mode: FilterMode,
): { nodes: RockyNode[]; edges: RockyEdge[] } {
  if (mode === 'all') return { nodes, edges }

  const visibleIds = new Set(
    nodes.filter(n => !INFRA_OPS.has(n.data.op_type)).map(n => n.id),
  )

  // Build adjacency for the full graph so we can trace through hidden nodes
  const outAdj = new Map<string, string[]>()
  for (const e of edges) {
    if (!outAdj.has(e.source)) outAdj.set(e.source, [])
    outAdj.get(e.source)!.push(e.target)
  }

  // For each hidden node, BFS forward until we hit a visible node
  function visibleSuccessors(startId: string): string[] {
    const result: string[] = []
    const queue = outAdj.get(startId) ?? []
    const seen = new Set<string>()
    const stack = [...queue]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      if (visibleIds.has(id)) {
        result.push(id)
      } else {
        for (const nxt of outAdj.get(id) ?? []) stack.push(nxt)
      }
    }
    return result
  }

  const visibleNodes = nodes.filter(n => visibleIds.has(n.id))

  // Keep direct edges between visible nodes + bypass edges through hidden nodes
  const edgeSet = new Set<string>()
  const bypassEdges: RockyEdge[] = []

  for (const e of edges) {
    if (visibleIds.has(e.source) && visibleIds.has(e.target)) {
      const key = `${e.source}->${e.target}`
      if (!edgeSet.has(key)) { edgeSet.add(key); bypassEdges.push(e) }
    } else if (visibleIds.has(e.source) && !visibleIds.has(e.target)) {
      // source is visible, target is hidden — find next visible nodes
      for (const dst of visibleSuccessors(e.target)) {
        const key = `${e.source}->${dst}`
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          bypassEdges.push({ id: key, source: e.source, target: dst })
        }
      }
    }
  }

  return { nodes: visibleNodes, edges: bypassEdges }
}

function applyDagreLayout(
  nodes: RockyNode[],
  edges: RockyEdge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 18, ranksep: 55, align: 'UL' })

  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const layoutedNodes: Node[] = nodes.map(n => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: n.data,
      type: 'rockyNode',
    }
  })

  const layoutedEdges: Edge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#52525b', width: 14, height: 14 },
    style: { stroke: '#52525b', strokeWidth: 1.2 },
  }))

  return { nodes: layoutedNodes, edges: layoutedEdges }
}

const HANDLE_STYLE = { background: 'transparent', border: 'none', width: 8, height: 8 }

// Custom node renderer
function RockyNodeComponent({ data, selected }: {
  data: { label: string; op_type: string; output_shapes: unknown[][] }
  selected: boolean
}) {
  const colour = getOpColour(data.op_type)
  const shape = data.output_shapes?.[0]
  const shapeStr = shape?.length ? shape.join('×') : ''

  return (
    <>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <div style={{
        width: NODE_W,
        height: NODE_H,
        background: selected ? colour + '22' : '#18181b',
        border: `1px solid ${selected ? colour : '#2a2a2f'}`,
        borderLeft: `3px solid ${colour}`,
        borderRadius: 6,
        padding: '6px 10px',
        cursor: 'pointer',
        boxShadow: selected ? `0 0 0 2px ${colour}33` : '0 1px 3px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
      }}>
        <div style={{
          fontWeight: 600,
          fontSize: 11,
          color: '#e7e5e4',
          lineHeight: 1,
        }}>
          {data.op_type}
        </div>
        {shapeStr && (
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            color: '#a8a29e',
            lineHeight: 1,
          }}>
            {shapeStr}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </>
  )
}

const nodeTypes = { rockyNode: RockyNodeComponent }

interface IOInfo {
  name: string
  shape: (number | string)[]
  dtype: string | null
}

interface Props {
  rawNodes: RockyNode[]
  rawEdges: RockyEdge[]
  selectedName: string | null
  searchQuery: string
  onNodeClick: (name: string) => void
  inputs?: IOInfo[]
  outputs?: IOInfo[]
}

function shapeStr(shape: (number | string)[]): string {
  return shape.length ? '[' + shape.join(', ') + ']' : '[]'
}

function IOPanel({ inputs = [], outputs = [] }: { inputs?: IOInfo[]; outputs?: IOInfo[] }) {
  if (!inputs.length && !outputs.length) return null
  return (
    <div style={{
      position: 'absolute', top: 10, left: 10, zIndex: 10,
      background: '#18181b',
      border: '1px solid #2a2a2f',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 10,
      fontFamily: 'JetBrains Mono, monospace',
      maxWidth: 280,
      pointerEvents: 'none',
    }}>
      {inputs.length > 0 && (
        <>
          <div style={{ color: '#10b981', fontWeight: 700, marginBottom: 4, letterSpacing: '0.05em' }}>
            INPUTS
          </div>
          {inputs.map(t => (
            <div key={t.name} style={{ display: 'flex', gap: 8, marginBottom: 2, alignItems: 'baseline' }}>
              <span style={{ color: '#e7e5e4', minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.name}
              </span>
              <span style={{ color: '#78716c' }}>{shapeStr(t.shape)}</span>
              {t.dtype && <span style={{ color: '#52525b' }}>{t.dtype}</span>}
            </div>
          ))}
        </>
      )}
      {outputs.length > 0 && (
        <>
          <div style={{ color: '#ef4444', fontWeight: 700, marginTop: inputs.length ? 8 : 0, marginBottom: 4, letterSpacing: '0.05em' }}>
            OUTPUTS
          </div>
          {outputs.map(t => (
            <div key={t.name} style={{ display: 'flex', gap: 8, marginBottom: 2, alignItems: 'baseline' }}>
              <span style={{ color: '#e7e5e4', minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.name}
              </span>
              <span style={{ color: '#78716c' }}>{shapeStr(t.shape)}</span>
              {t.dtype && <span style={{ color: '#52525b' }}>{t.dtype}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default function GraphView({ rawNodes, rawEdges, selectedName, searchQuery, onNodeClick, inputs, outputs }: Props) {
  const [filterMode, setFilterMode] = useState<FilterMode>('semantic')

  const { nodes: laid, edges: laidEdges } = useMemo(() => {
    const { nodes: fn, edges: fe } = filterGraph(rawNodes, rawEdges, filterMode)
    return applyDagreLayout(fn, fe)
  }, [rawNodes, rawEdges, filterMode])

  const [nodes, setNodes, onNodesChange] = useNodesState(laid)
  const [edges, , onEdgesChange] = useEdgesState(laidEdges)

  // Sync selection + search filter
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      const isSelected = n.id === selectedName
      const matchesSearch = !searchQuery ||
        n.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.data as { op_type: string }).op_type.toLowerCase().includes(searchQuery.toLowerCase())
      return {
        ...n,
        selected: isSelected,
        hidden: searchQuery ? !matchesSearch : false,
      }
    }))
  }, [selectedName, searchQuery, setNodes])

  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    onNodeClick(node.id)
  }, [onNodeClick])

  const semanticCount = rawNodes.filter(n => !INFRA_OPS.has(n.data.op_type)).length
  const totalCount = rawNodes.length

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <IOPanel inputs={inputs} outputs={outputs} />

      {/* Filter toggle */}
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 10,
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, color: '#78716c', marginRight: 4 }}>
          {filterMode === 'semantic'
            ? `${semanticCount} semantic nodes`
            : `${totalCount} nodes (all)`}
        </span>
        {(['semantic', 'all'] as FilterMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setFilterMode(mode)}
            style={{
              padding: '3px 10px',
              fontSize: 10,
              fontWeight: 600,
              border: '1px solid',
              borderRadius: 4,
              cursor: 'pointer',
              borderColor: filterMode === mode ? '#d97706' : '#2a2a2f',
              background: filterMode === mode ? '#d9770620' : '#18181b',
              color: filterMode === mode ? '#d97706' : '#78716c',
            }}
          >
            {mode === 'semantic' ? 'Semantic' : 'All'}
          </button>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.02}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#26262b"
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={n => getOpColour((n.data as { op_type: string }).op_type)}
          maskColor="rgba(13,13,14,0.6)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
}
