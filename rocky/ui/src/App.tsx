import { useCallback, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import './styles/rocky.css'
import { useModel } from './hooks/useModel'
import { useSelectedNode } from './hooks/useSelectedNode'
import { useProviderConfig } from './hooks/useProviderConfig'
import GraphView from './components/GraphView'
import NodeInspector from './components/NodeInspector'
import Toolbar from './components/Toolbar'
import RockyMascot from './components/RockyMascot'
import SettingsModal from './components/SettingsModal'
import ChatPanel from './components/ChatPanel'

export default function App() {
  const { graph, summary, backendReady, loading, error, loadModel } = useModel()
  const { selectedName, nodeDetail, selectNode } = useSelectedNode()
  const providerCfg = useProviderConfig()
  const [searchQuery, setSearchQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleOpenModel = useCallback(async () => {
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'ONNX model', extensions: ['onnx'] }],
      })
      if (typeof picked === 'string') {
        selectNode(null)
        await loadModel(picked)
      }
    } catch (e) {
      console.error('Open model failed:', e)
    }
  }, [loadModel, selectNode])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <Toolbar
        summary={summary}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenModel={handleOpenModel}
        onOpenSettings={() => setSettingsOpen(true)}
        loading={loading}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={providerCfg.config}
        onSaveKey={providerCfg.save}
        onRemoveKey={providerCfg.remove}
        onPickProvider={providerCfg.pickProvider}
        onPickModel={providerCfg.pickModel}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', position: 'relative', minWidth: 0, overflow: 'hidden' }}>
          {!backendReady && <CenterMessage primary="Waking Rocky…" secondary="Starting backend sidecar." spinning />}
          {backendReady && error && (
            <CenterMessage primary="Something is off." secondary={error} />
          )}
          {backendReady && !error && !summary && !loading && (
            <CenterMessage
              primary="No model loaded."
              secondary="Click 'Open Model' to choose a .onnx file."
            />
          )}
          {backendReady && !error && loading && (
            <CenterMessage primary="Parsing model…" spinning />
          )}
          {backendReady && summary && graph.nodes.length > 0 && (
            <>
              <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                <GraphView
                  rawNodes={graph.nodes}
                  rawEdges={graph.edges}
                  selectedName={selectedName}
                  searchQuery={searchQuery}
                  onNodeClick={selectNode}
                />
              </div>
              {nodeDetail && (
                <NodeInspector node={nodeDetail} onClose={() => selectNode(null)} />
              )}
            </>
          )}
        </div>

        <ChatPanel
          config={providerCfg.config}
          selectedName={selectedName}
          selectedOpType={nodeDetail?.op_type ?? null}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>
    </div>
  )
}

function CenterMessage({ primary, secondary, spinning }: {
  primary: string
  secondary?: string
  spinning?: boolean
}) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, color: 'var(--text-dim)',
    }}>
      {spinning ? (
        <div style={{
          width: 24, height: 24,
          border: '2px solid var(--border)',
          borderTop: '2px solid var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite',
        }} />
      ) : (
        <RockyMascot size={36} />
      )}
      <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>{primary}</div>
      {secondary && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)', maxWidth: 480, textAlign: 'center' }}>
          {secondary}
        </div>
      )}
    </div>
  )
}
