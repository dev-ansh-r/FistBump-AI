/**
 * LLM provider catalogue. Keep in sync with backend adapters (Phase 2).
 * Add new providers/models here — UI picks them up automatically.
 */
export type ProviderId = 'anthropic' | 'openai' | 'gemini'

export interface ProviderInfo {
  id: ProviderId
  label: string
  keyPlaceholder: string
  keyHint: string
  models: { id: string; label: string }[]
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-api03-…',
    keyHint: 'Get one at console.anthropic.com',
    models: [
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyPlaceholder: 'sk-…',
    keyHint: 'Get one at platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'o1', label: 'o1' },
      { id: 'o1-mini', label: 'o1-mini' },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    keyPlaceholder: 'AIza…',
    keyHint: 'Get one at aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
  },
]

export function providerInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find(p => p.id === id)
}

export function defaultModel(id: ProviderId): string {
  return PROVIDERS.find(p => p.id === id)?.models[0].id ?? ''
}
