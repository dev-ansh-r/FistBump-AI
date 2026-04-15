import { useEffect, useState } from 'react'
import { PROVIDERS, type ProviderId, defaultModel, providerInfo } from '../lib/providers'
import { peekApiKey } from '../lib/secrets'
import type { RockyConfig } from '../lib/secrets'

interface Props {
  open: boolean
  onClose: () => void
  config: RockyConfig
  onSaveKey: (provider: ProviderId, key: string) => Promise<void>
  onRemoveKey: (provider: ProviderId) => Promise<void>
  onPickProvider: (provider: ProviderId) => Promise<void>
  onPickModel: (provider: ProviderId, model: string) => Promise<void>
}

export default function SettingsModal({
  open, onClose, config, onSaveKey, onRemoveKey, onPickProvider, onPickModel,
}: Props) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          width: 560, maxHeight: '85vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>LLM providers</div>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PROVIDERS.map(p => (
            <ProviderRow
              key={p.id}
              provider={p.id}
              config={config}
              onSave={onSaveKey}
              onRemove={onRemoveKey}
              onPickProvider={onPickProvider}
              onPickModel={onPickModel}
            />
          ))}
          <div style={{
            marginTop: 4, padding: '10px 12px',
            background: 'var(--bg-elevated)', borderRadius: 6,
            border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
          }}>
            Keys are stored in your OS secret store (Windows Credential Manager / macOS
            Keychain / Linux Secret Service). They never touch disk as plaintext and are
            scoped to your user account.
          </div>
        </div>
      </div>
    </div>
  )
}

function ProviderRow({
  provider, config, onSave, onRemove, onPickProvider, onPickModel,
}: {
  provider: ProviderId
  config: RockyConfig
  onSave: (p: ProviderId, key: string) => Promise<void>
  onRemove: (p: ProviderId) => Promise<void>
  onPickProvider: (p: ProviderId) => Promise<void>
  onPickModel: (p: ProviderId, m: string) => Promise<void>
}) {
  const info = providerInfo(provider)!
  const configured = config.configured.includes(provider)
  const isActive = config.active_provider === provider
  const activeModel = config.active_model[provider] ?? defaultModel(provider)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (configured) {
      peekApiKey(provider).then(setPreview).catch(() => setPreview(''))
    } else {
      setPreview('')
    }
  }, [provider, configured])

  const handleSave = async () => {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await onSave(provider, draft.trim())
      setDraft('')
      setEditing(false)
    } finally { setBusy(false) }
  }

  const handleRemove = async () => {
    setBusy(true)
    try { await onRemove(provider) } finally { setBusy(false) }
  }

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 8, padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: editing || configured ? 10 : 0 }}>
        <StatusDot configured={configured} active={isActive} />
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{info.label}</span>
        {isActive && (
          <span style={activeTag}>active</span>
        )}
        <div style={{ flex: 1 }} />
        {configured && !editing && !isActive && (
          <button style={linkBtn} onClick={() => onPickProvider(provider)}>Use this</button>
        )}
        {configured && !editing && (
          <>
            <button style={linkBtn} onClick={() => setEditing(true)}>Edit</button>
            <button style={linkBtnDanger} onClick={handleRemove} disabled={busy}>Remove</button>
          </>
        )}
        {!configured && !editing && (
          <button style={primaryBtn} onClick={() => setEditing(true)}>Add key</button>
        )}
      </div>

      {configured && !editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <code style={keyPreview}>{preview || '••••'}</code>
          <div style={{ flex: 1 }} />
          <label style={subLabel}>Model</label>
          <select
            value={activeModel}
            onChange={e => onPickModel(provider, e.target.value)}
            style={selectBox}
          >
            {info.models.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      )}

      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            autoFocus
            type="password"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={info.keyPlaceholder}
            style={keyInput}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{info.keyHint}</span>
            <button style={linkBtn} onClick={() => { setEditing(false); setDraft('') }}>Cancel</button>
            <button style={primaryBtn} onClick={handleSave} disabled={busy || !draft.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusDot({ configured, active }: { configured: boolean; active: boolean }) {
  const color = active ? 'var(--accent)' : configured ? '#10b981' : 'var(--text-muted)'
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%',
      background: color,
      boxShadow: active ? '0 0 6px var(--accent)' : 'none',
    }} />
  )
}

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-muted)',
  fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: '0 4px',
}

const linkBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)',
  borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
}
const linkBtnDanger: React.CSSProperties = {
  ...linkBtn, color: '#fca5a5', borderColor: '#3f1d1d',
}
const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)', color: '#0d0d0e', border: 'none',
  borderRadius: 4, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
}

const activeTag: React.CSSProperties = {
  background: 'var(--accent-soft)', color: 'var(--accent)',
  border: '1px solid var(--accent)', borderRadius: 3,
  fontSize: 9, padding: '1px 5px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

const keyPreview: React.CSSProperties = {
  background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '3px 8px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 10,
}

const keyInput: React.CSSProperties = {
  background: 'var(--bg-panel)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '6px 10px', color: 'var(--text)',
  fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
}

const subLabel: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)' }
const selectBox: React.CSSProperties = {
  background: 'var(--bg-panel)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '3px 8px', color: 'var(--text)', fontSize: 11,
  outline: 'none', cursor: 'pointer',
}
