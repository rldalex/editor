import { useMemo } from 'react'
import { useHAStore } from './store'
import type { HAArea, HADevice, HAEntity, HAState } from './types'

export const useHAConnection = (): {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error: string | null
} => {
  const status = useHAStore((s) => s.status)
  const error = useHAStore((s) => s.error)
  return { status, error }
}

export const useHAState = (entityId: string | undefined): HAState | undefined =>
  useHAStore((s) => (entityId ? s.states[entityId] : undefined))

export const useHAStates = (): Record<string, HAState> =>
  useHAStore((s) => s.states)

export const useHAEntities = (): HAEntity[] => {
  const entities = useHAStore((s) => s.entities)
  return useMemo(() => Object.values(entities), [entities])
}

export const useHAEntity = (entityId: string | undefined): HAEntity | undefined =>
  useHAStore((s) => (entityId ? s.entities[entityId] : undefined))

export const useHAAreas = (): HAArea[] => {
  const areas = useHAStore((s) => s.areas)
  return useMemo(() => Object.values(areas), [areas])
}

export const useHADevices = (): HADevice[] => {
  const devices = useHAStore((s) => s.devices)
  return useMemo(() => Object.values(devices), [devices])
}
