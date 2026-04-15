import { useCallback, useEffect, useState } from 'react'
import {
  type RockyConfig,
  deleteApiKey,
  getConfig,
  saveApiKey,
  setActiveModel,
  setActiveProvider,
} from '../lib/secrets'
import { defaultModel, type ProviderId } from '../lib/providers'

const EMPTY: RockyConfig = { active_provider: null, active_model: {}, configured: [] }

export function useProviderConfig() {
  const [config, setConfig] = useState<RockyConfig>(EMPTY)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const cfg = await getConfig()
      setConfig(cfg ?? EMPTY)
    } catch (e) {
      console.error('Load config failed:', e)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const save = useCallback(async (provider: ProviderId, key: string) => {
    await saveApiKey(provider, key)
    await refresh()
  }, [refresh])

  const remove = useCallback(async (provider: ProviderId) => {
    await deleteApiKey(provider)
    await refresh()
  }, [refresh])

  const pickProvider = useCallback(async (provider: ProviderId) => {
    await setActiveProvider(provider)
    if (!config.active_model[provider]) {
      await setActiveModel(provider, defaultModel(provider))
    }
    await refresh()
  }, [config.active_model, refresh])

  const pickModel = useCallback(async (provider: ProviderId, model: string) => {
    await setActiveModel(provider, model)
    await refresh()
  }, [refresh])

  const isConfigured = useCallback((p: ProviderId) => config.configured.includes(p), [config.configured])

  return { config, loaded, refresh, save, remove, pickProvider, pickModel, isConfigured }
}
