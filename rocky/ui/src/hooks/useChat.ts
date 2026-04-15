import { useCallback, useRef, useState } from 'react'
import { getApiKey } from '../lib/secrets'
import type { RockyConfig } from '../lib/secrets'
import { defaultModel, type ProviderId } from '../lib/providers'
import { api } from '../lib/api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Name of the node that was in context when this user message was sent. */
  nodeContext?: string | null
}

export function useChat(config: RockyConfig) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(async (text: string, nodeContext: string | null) => {
    const provider = config.active_provider as ProviderId | null
    if (!provider) {
      setError('No provider configured. Open settings and add an API key.')
      return
    }
    const model = config.active_model[provider] ?? defaultModel(provider)

    let apiKey: string
    try {
      apiKey = await getApiKey(provider)
    } catch (e) {
      setError(`Could not read stored key: ${e}`)
      return
    }

    const userMsg: ChatMessage = { role: 'user', content: text, nodeContext }
    const baseMessages: ChatMessage[] = [...messages, userMsg]
    // Placeholder assistant message that we'll fill as tokens arrive
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
    setMessages([...baseMessages, assistantMsg])
    setError(null)
    setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(api('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          provider, model, api_key: apiKey,
          // Strip the nodeContext field when serialising (backend doesn't need it per-message)
          messages: baseMessages.map(m => ({ role: m.role, content: m.content })),
          node_context: nodeContext,
        }),
      })
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let idx: number
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const line = frame.split('\n').find(l => l.startsWith('data:'))
          if (!line) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          try {
            const ev = JSON.parse(raw)
            if (ev.error) { setError(ev.error); continue }
            if (ev.token) {
              acc += ev.token
              setMessages(msgs => {
                const copy = msgs.slice()
                copy[copy.length - 1] = { role: 'assistant', content: acc }
                return copy
              })
            }
          } catch { /* ignore partial */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [config.active_provider, config.active_model, messages])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, streaming, error, send, stop, clear }
}
