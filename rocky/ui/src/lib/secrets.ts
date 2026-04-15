/** Typed wrappers around Tauri invoke commands for key/config storage. */
import { invoke } from '@tauri-apps/api/core'

export interface RockyConfig {
  active_provider: string | null
  active_model: Record<string, string>
  configured: string[]
}

export const saveApiKey = (provider: string, key: string) =>
  invoke<void>('save_api_key', { provider, key })

export const deleteApiKey = (provider: string) =>
  invoke<void>('delete_api_key', { provider })

export const peekApiKey = (provider: string) =>
  invoke<string>('peek_api_key', { provider })

export const getApiKey = (provider: string) =>
  invoke<string>('get_api_key', { provider })

export const getConfig = () => invoke<RockyConfig>('get_config')

export const setActiveProvider = (provider: string) =>
  invoke<void>('set_active_provider', { provider })

export const setActiveModel = (provider: string, model: string) =>
  invoke<void>('set_active_model', { provider, model })
