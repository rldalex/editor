export type HAStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface HAState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
  context?: { id: string; parent_id?: string | null; user_id?: string | null }
}

export interface HAEntity {
  entity_id: string
  name?: string
  area_id?: string | null
  device_id?: string | null
  platform?: string
  disabled_by?: string | null
  hidden_by?: string | null
}

export interface HAArea {
  area_id: string
  name: string
  picture?: string | null
  icon?: string | null
}

export interface HADevice {
  id: string
  name?: string | null
  area_id?: string | null
  manufacturer?: string | null
  model?: string | null
}

export interface HAServiceTarget {
  entity_id?: string | string[]
  device_id?: string | string[]
  area_id?: string | string[]
}

export type HADomain = string

export const entityDomain = (entityId: string): HADomain =>
  entityId.split('.')[0] ?? ''
