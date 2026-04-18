/**
 * HA mapping stored on Pascal node.metadata.ha.
 *
 * One node may bind several entities (e.g. a lamp mesh bound to both `light.salon`
 * and a motion sensor). `role` disambiguates when a system needs the "primary"
 * visual vs. auxiliary data.
 *
 * Runtime validation is intentionally omitted for now — all writes go through
 * `setHAMapping` which enforces shape at the type level. If scene JSON ever
 * starts coming from untrusted sources, add a parser here.
 */

export const HA_METADATA_KEY = 'ha' as const

// --- Visual descriptors ---

export type HAEmissiveVisual = {
  kind: 'emissive'
  onColor?: string
  offColor?: string
  intensityOn?: number
  intensityOff?: number
}

export type HACoverVisual = {
  kind: 'cover'
  transform?: 'position' | 'rotation'
  axis?: 'x' | 'y' | 'z'
  openValue: number
  closedValue: number
}

export type HALabelVisual = {
  kind: 'label'
  attribute?: string
  format?: string
  offset?: [number, number, number]
}

export type HAColorVisual = {
  kind: 'color'
  mapping: Record<string, string>
  fallback?: string
}

export type HAVisualMapping = HAEmissiveVisual | HACoverVisual | HALabelVisual | HAColorVisual

// --- Action descriptors ---

export type HAToggleAction = { kind: 'toggle' }

export type HACallServiceAction = {
  kind: 'call_service'
  domain: string
  service: string
  data?: Record<string, unknown>
}

export type HAPopupType = 'brightness' | 'climate' | 'media' | 'cover' | 'generic'

export type HAPopupAction = {
  kind: 'popup'
  popupType: HAPopupType
}

export type HANavigateAction = {
  kind: 'navigate'
  to: string
}

export type HANoneAction = { kind: 'none' }

export type HAAction =
  | HAToggleAction
  | HACallServiceAction
  | HAPopupAction
  | HANavigateAction
  | HANoneAction

// --- Binding + mapping ---

export type HAEntityBinding = {
  entityId: string
  domain: string
  role?: string
  visual?: HAVisualMapping
  tapAction?: HAAction
  longPressAction?: HAAction
}

export type HAMapping = {
  bindings: HAEntityBinding[]
}
