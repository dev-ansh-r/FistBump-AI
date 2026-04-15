import type { ModelSummary } from '../hooks/useModel'
import RockyMascot from './RockyMascot'

interface Props {
  summary: ModelSummary | null
  searchQuery: string
  onSearchChange: (q: string) => void
  onOpenModel: () => void
  onOpenSettings: () => void
  loading?: boolean
}

export default function Toolbar({ summary, searchQuery, onSearchChange, onOpenModel, onOpenSettings, loading }: Props) {
  return (
    <div style={{
      height: 48,
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 14,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <RockyMascot />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Rocky
        </span>
      </div>

      <div style={{ width: 1, height: 18, background: 'var(--border)' }} />

      {summary ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{summary.name}</span>
          <Pill>{summary.n_nodes.toLocaleString()} nodes</Pill>
          <Pill>{formatParams(summary.n_params)} params</Pill>
          <Pill>{summary.format.toUpperCase()}</Pill>
        </div>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {loading ? 'Loading model…' : 'No model loaded'}
        </span>
      )}

      <div style={{ flex: 1 }} />

      <input
        type="text"
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search nodes…"
        disabled={!summary}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '5px 12px',
          color: 'var(--text)',
          fontSize: 12,
          width: 200,
          outline: 'none',
          transition: 'border-color 0.15s',
          opacity: summary ? 1 : 0.4,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
      />

      <button
        onClick={onOpenModel}
        disabled={loading}
        style={{
          background: 'var(--accent)',
          color: '#0d0d0e',
          border: 'none',
          borderRadius: 6,
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.6 : 1,
          letterSpacing: '0.01em',
        }}
      >
        Open Model
      </button>

      <button
        onClick={onOpenSettings}
        title="Settings"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-dim)',
          borderRadius: 6,
          width: 32, height: 30,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      background: 'var(--bg-elevated)',
      color: 'var(--text-dim)',
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 500,
      border: '1px solid var(--border)',
    }}>
      {children}
    </span>
  )
}

function formatParams(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(n)
}
