import { useCallback, useEffect, useState } from 'react'
import type { NodeDetail } from './useModel'
import { api } from '../lib/api'

export function useSelectedNode() {
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null)

  useEffect(() => {
    if (!selectedName) {
      setNodeDetail(null)
      return
    }
    let cancelled = false
    fetch(api(`/api/node?name=${encodeURIComponent(selectedName)}`))
      .then(r => (r.ok ? r.json() : null))
      .then((d: NodeDetail | null) => { if (!cancelled) setNodeDetail(d) })
      .catch(() => { if (!cancelled) setNodeDetail(null) })
    return () => { cancelled = true }
  }, [selectedName])

  const selectNode = useCallback((name: string | null) => {
    setSelectedName(name)
  }, [])

  return { selectedName, nodeDetail, selectNode }
}
