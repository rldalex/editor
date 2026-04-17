import { createStore, useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { HAArea, HADevice, HAEntity, HAState, HAStatus } from './types'

export interface HABridgeState {
  status: HAStatus
  error: string | null
  states: Record<string, HAState>
  entities: Record<string, HAEntity>
  areas: Record<string, HAArea>
  devices: Record<string, HADevice>
}

export interface HABridgeActions {
  setStatus: (status: HAStatus, error?: string | null) => void
  setStates: (states: Record<string, HAState>) => void
  patchState: (entityId: string, state: HAState) => void
  removeState: (entityId: string) => void
  setEntities: (entities: HAEntity[]) => void
  setAreas: (areas: HAArea[]) => void
  setDevices: (devices: HADevice[]) => void
  reset: () => void
}

const initialState: HABridgeState = {
  status: 'disconnected',
  error: null,
  states: {},
  entities: {},
  areas: {},
  devices: {},
}

export const haStore = createStore<HABridgeState & HABridgeActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,
    setStatus: (status, error = null) => set({ status, error }),
    setStates: (states) => set({ states }),
    patchState: (entityId, state) =>
      set((s) => ({ states: { ...s.states, [entityId]: state } })),
    removeState: (entityId) =>
      set((s) => {
        const next = { ...s.states }
        delete next[entityId]
        return { states: next }
      }),
    setEntities: (entities) =>
      set({
        entities: Object.fromEntries(entities.map((e) => [e.entity_id, e])),
      }),
    setAreas: (areas) =>
      set({ areas: Object.fromEntries(areas.map((a) => [a.area_id, a])) }),
    setDevices: (devices) =>
      set({ devices: Object.fromEntries(devices.map((d) => [d.id, d])) }),
    reset: () => set(initialState),
  }))
)

export const useHAStore = <T,>(
  selector: (s: HABridgeState & HABridgeActions) => T,
): T => useStore(haStore, selector)
