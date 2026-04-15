import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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
  Conv: '#3b82f6',
  ConvTranspose: '#3b82f6',
  BatchNormalization: '#8b5cf6',
  LayerNormalization: '#8b5cf6',
  GroupNormalization: '#8b5cf6',
  InstanceNormalization: '#8b5cf6',
  Relu: '#10b981',
  Gelu: '#10b981',
  Sigmoid: '#10b981',
  Tanh: '#10b981',
  HardSwish: '#10b981',
  Clip: '#10b981',
  MaxPool: '#f59e0b',
  AveragePool: '#f59e0b',
  GlobalAveragePool: '#f59e0b',
  MatMul: '#ef4444',
  Gemm: '#ef4444',
  Attention: '#ef4444',
  MultiHeadAttention: '#ef4444',
  Add: '#06b6d4',
  Mul: '#06b6d4',
  Concat: '#64748b',
  Reshape: '#64748b',
  Transpose: '#64748b',
  Flatten: '#64748b',
  Squeeze: '#64748b',
  Unsqueeze: '#64748b',
  Constant: '#334155',
  Identity: '#334155',
}

const NODE_W = 180
const NODE_H = 48

function getOpColour(opType: string): string {
  return OP_COLOUR[opType] ?? '#475569'
}

function applyDagreLayout(
  nodes: RockyNode[],
  edges: RockyEdge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 40 })

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
    markerEnd: { type: MarkerType.ArrowClosed, color: '#3a3a40' },
    style: { stroke: '#3a3a40', strokeWidth: 1.4 },
  }))

  return { nodes: layoutedNodes, edges: layoutedEdges }
}

// Custom node renderer
function RockyNodeComponent({ data, selected }: {
  data: { label: string; op_type: string; output_shapes: unknown[][] }
  selected: boolean
}) {
  const colour = getOpColour(data.op_type)
  const shape = data.output_shapes?.[0]
  const shapeStr = shape?.length ? shape.join('×') : ''

  return (
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
  )
}

const nodeTypes = { rockyNode: RockyNodeComponent }

interface Props {
  rawNodes: RockyNode[]
  rawEdges: RockyEdge[]
  selectedName: string | null
  searchQuery: string
  onNodeClick: (name: string) => void
}

export default function GraphView({ rawNodes, rawEdges, selectedName, searchQuery, onNodeClick }: Props) {
  const { nodes: laid, edges: laidEdges } = useMemo(
    () => applyDagreLayout(rawNodes, rawEdges),
    [rawNodes, rawEdges],
  )

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

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.05}
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
