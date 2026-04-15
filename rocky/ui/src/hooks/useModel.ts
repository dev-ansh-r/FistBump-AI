import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export interface TensorInfo {
  name: string
  shape: (number | string)[]
  dtype: string | null
  is_weight?: boolean
}

export interface RockyNode {
  id: string
  data: {
    label: string
    op_type: string
    output_shapes: (number | string)[][]
  }
  type: string
}

export interface RockyEdge {
  id: string
  source: string
  target: string
}

export interface NodeDetail {
  name: string
  op_type: string
  inputs: TensorInfo[]
  outputs: TensorInfo[]
  attributes: Record<string, unknown>
  weight_shapes: Record<string, number[]>
  prev_nodes: string[]
  next_nodes: string[]
}

export interface ModelSummary {
  name: string
  format: string
  n_nodes: number
  n_params: number
  inputs: TensorInfo[]
  outputs: TensorInfo[]
  op_histogram: Record<string, number>
}

interface GraphData {
  nodes: RockyNode[]
  edges: RockyEdge[]
}

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [] }

async function pollUntilHealthy(maxMs = 8000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(api('/api/health'))
      if (r.ok) return true
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

export function useModel() {
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH)
  const [summary, setSummary] = useState<ModelSummary | null>(null)
  const [backendReady, setBackendReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Wait for backend sidecar to come up
  useEffect(() => {
    pollUntilHealthy().then(ok => {
      setBackendReady(ok)
      if (!ok) setError('Rocky backend did not respond. Is `pip install -e .` done?')
    })
  }, [])

  const loadModel = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(api('/api/load'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (!r.ok) {
        const txt = await r.text()
        throw new Error(txt || `Load failed (${r.status})`)
      }
      const summaryData: ModelSummary = await r.json()
      const graphRes = await fetch(api('/api/graph'))
      const graphData: GraphData = await graphRes.json()
      setSummary(summaryData)
      setGraph(graphData)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setGraph(EMPTY_GRAPH)
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  return { graph, summary, backendReady, loading, error, loadModel }
}
