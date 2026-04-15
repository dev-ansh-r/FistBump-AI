import { useEffect, useRef, useState } from 'react'
import { useChat } from '../hooks/useChat'
import { providerInfo, type ProviderId } from '../lib/providers'
import type { RockyConfig } from '../lib/secrets'

interface Props {
  config: RockyConfig
  selectedName: string | null
  selectedOpType: string | null
  onOpenSettings: () => void
}

export default function ChatPanel({ config, selectedName, selectedOpType, onOpenSettings }: Props) {
  const { messages, streaming, error, send, stop, clear } = useChat(config)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  const provider = config.active_provider as ProviderId | null
  const info = provider ? providerInfo(provider) : undefined
  const activeModel = provider ? config.active_model[provider] : undefined
  const ready = Boolean(provider && info)

  const handleSend = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    await send(text, selectedName)
  }

  return (
    <div style={{
      width: 400,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-panel)',
      borderLeft: '1px solid var(--border)',
      flexShrink: 0, height: '100%', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Rocky</div>
        <div style={{ flex: 1 }} />
        {ready ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{info!.label}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {activeModel}
            </span>
          </div>
        ) : (
          <button onClick={onOpenSettings} style={setupBtn}>Set up LLM</button>
        )}
        {messages.length > 0 && (
          <button onClick={clear} style={miniBtn} title="New conversation">new</button>
        )}
      </div>

      {/* Context chip */}
      {selectedName && (
        <div style={{
          padding: '6px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 9, color: 'var(--accent)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>Context</span>
          {selectedOpType && <span style={opTag}>{selectedOpType}</span>}
          <span style={{
            fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1,
          }} title={selectedName}>
            {selectedName.length > 34 ? '…' + selectedName.slice(-32) : selectedName}
          </span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.length === 0 && !streaming && (
          <EmptyState ready={ready} onOpenSettings={onOpenSettings} />
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} streaming={streaming && i === messages.length - 1} />
        ))}
        {error && (
          <div style={{
            padding: '8px 10px', borderRadius: 6,
            background: 'rgba(239,68,68,0.08)', border: '1px solid #7f1d1d',
            color: '#fca5a5', fontSize: 11, fontFamily: 'var(--font-mono)',
          }}>{error}</div>
        )}
      </div>

      {/* Composer */}
      <div style={{
        padding: 10, borderTop: '1px solid var(--border)', flexShrink: 0,
        display: 'flex', gap: 6, alignItems: 'flex-end', background: 'var(--bg-panel)',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={ready ? 'Ask Rocky about this model…' : 'Configure a provider to chat'}
          disabled={!ready}
          rows={2}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          style={{
            flex: 1, resize: 'none',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 6, padding: '8px 10px',
            color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font)',
            outline: 'none', lineHeight: 1.5,
          }}
        />
        {streaming ? (
          <button onClick={stop} style={stopBtn}>Stop</button>
        ) : (
          <button onClick={handleSend} disabled={!ready || !input.trim()} style={sendBtn}>Send</button>
        )}
      </div>
    </div>
  )
}

function Bubble({ role, content, streaming }: { role: 'user' | 'assistant'; content: string; streaming: boolean }) {
  const isUser = role === 'user'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      gap: 2,
    }}>
      <div style={{
        fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.06em', fontWeight: 600, padding: '0 4px',
      }}>
        {isUser ? 'You' : 'Rocky'}
      </div>
      <div style={{
        maxWidth: '92%',
        background: isUser ? 'var(--accent-soft)' : 'var(--bg-elevated)',
        border: `1px solid ${isUser ? 'var(--accent)' : 'var(--border)'}`,
        color: 'var(--text)', borderRadius: 8,
        padding: '8px 11px', fontSize: 12, lineHeight: 1.55,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {content || (streaming ? <span style={{ color: 'var(--text-muted)' }}>…</span> : '')}
        {streaming && content && <span style={{ color: 'var(--accent)', marginLeft: 2 }}>▌</span>}
      </div>
    </div>
  )
}

function EmptyState({ ready, onOpenSettings }: { ready: boolean; onOpenSettings: () => void }) {
  return (
    <div style={{
      margin: 'auto', textAlign: 'center', color: 'var(--text-muted)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 20,
    }}>
      <div style={{ fontSize: 22 }}>🖐</div>
      {ready ? (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Click any node in the graph — Rocky will see it as context.<br />
            Then ask why it's there.
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No provider configured.</div>
          <button style={setupBtn} onClick={onOpenSettings}>Open settings</button>
        </>
      )}
    </div>
  )
}

const opTag: React.CSSProperties = {
  background: 'var(--accent-soft)', color: 'var(--accent)',
  border: '1px solid var(--accent)', borderRadius: 3,
  fontSize: 9, padding: '1px 5px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}
const setupBtn: React.CSSProperties = {
  background: 'var(--accent)', color: '#0d0d0e', border: 'none',
  borderRadius: 4, padding: '3px 9px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
}
const miniBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)',
  borderRadius: 4, padding: '2px 7px', fontSize: 9, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
}
const sendBtn: React.CSSProperties = {
  background: 'var(--accent)', color: '#0d0d0e', border: 'none',
  borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  alignSelf: 'stretch',
}
const stopBtn: React.CSSProperties = {
  background: 'transparent', color: '#fca5a5', border: '1px solid #7f1d1d',
  borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
