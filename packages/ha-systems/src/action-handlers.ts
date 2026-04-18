import { callService } from '@maison-3d/ha-bridge'
import type { HAAction, HAEntityBinding } from './schema'

export const TOGGLE_DOMAINS = new Set([
  'light', 'switch', 'fan', 'cover',
  'input_boolean', 'automation', 'group',
])

export type DispatchScope = 'editor' | 'kiosk'

export type ActionHandler = (
  binding: HAEntityBinding,
  action: HAAction,
) => Promise<void>

// Module-level dedupe: we only warn once per entityId when popup actions are
// silently no-op'd in kiosk scope. PHASE 7 (popups) is deferred post-kiosk;
// this prevents the kiosk from crashing if the bundle contains popup actions.
const popupWarnedEntities = new Set<string>()

export function _resetPopupWarnedEntities(): void {
  popupWarnedEntities.clear()
}

/**
 * Dispatches a validated action for a given binding, scoped to either the
 * editor (default) or the kiosk. In kiosk scope, `popup` actions are silently
 * ignored with a one-time `console.warn` per entity — popups are an editor-only
 * UI (brightness slider, climate control) not implemented in the kiosk.
 *
 * Returns a promise that resolves when the underlying handler completes, or
 * `undefined` if the action was suppressed/unknown. Errors bubble up from the
 * individual handlers (which already log and swallow service-call failures).
 */
export function dispatchAction(
  action: HAAction,
  binding: HAEntityBinding,
  opts: { scope?: DispatchScope } = {},
): Promise<void> | undefined {
  const scope: DispatchScope = opts.scope ?? 'editor'

  if (scope === 'kiosk' && action.kind === 'popup') {
    if (!popupWarnedEntities.has(binding.entityId)) {
      popupWarnedEntities.add(binding.entityId)
      console.warn(
        `[HAInteractionSystem] popup action ignored in kiosk scope for ${binding.entityId}`,
      )
    }
    return
  }

  const handler = HANDLERS[action.kind]
  if (!handler) return
  return handler(binding, action)
}

async function handleToggle(binding: HAEntityBinding): Promise<void> {
  try {
    await callService({
      domain: 'homeassistant',
      service: 'toggle',
      target: { entity_id: binding.entityId },
    })
  } catch (err) {
    console.error('HAInteractionSystem: toggle failed', {
      entityId: binding.entityId,
      error: err instanceof Error ? err.message : err,
    })
  }
}

async function handleCallService(
  binding: HAEntityBinding,
  action: HAAction,
): Promise<void> {
  if (action.kind !== 'call_service') return
  try {
    await callService({
      domain: action.domain,
      service: action.service,
      data: action.data,
      target: { entity_id: binding.entityId },
    })
  } catch (err) {
    console.error('HAInteractionSystem: call_service failed', {
      entityId: binding.entityId,
      service: `${action.domain}.${action.service}`,
      error: err instanceof Error ? err.message : err,
    })
  }
}

export const HANDLERS: Record<HAAction['kind'], ActionHandler | null> = {
  toggle: (b) => handleToggle(b),
  call_service: (b, a) => handleCallService(b, a),
  popup: null,
  navigate: null,
  none: async () => {},
}

/**
 * Validates that an action can be dispatched at runtime. Logs one error per
 * invalid binding at registration time (not per fire). Returns true if the
 * action is dispatchable.
 */
export function validateAction(
  nodeId: string,
  binding: HAEntityBinding,
  trigger: 'tap' | 'longPress',
  action: HAAction | undefined,
): boolean {
  if (!action || action.kind === 'none') return false

  if (HANDLERS[action.kind] === null) {
    console.error(
      `HAInteractionSystem: ${trigger}Action kind '${action.kind}' not ` +
        `implemented in v1 (binding on ${nodeId}, entity=${binding.entityId}). ` +
        `Supported: toggle, call_service, none.`,
    )
    return false
  }

  if (action.kind === 'toggle' && !TOGGLE_DOMAINS.has(binding.domain)) {
    console.error(
      `HAInteractionSystem: toggle not supported for domain ` +
        `'${binding.domain}' on ${binding.entityId} (node ${nodeId}). ` +
        `Use call_service instead.`,
    )
    return false
  }

  return true
}

// Debounce state per (nodeId, entityId, trigger). 300ms window.
export const DEBOUNCE_MS = 300
const lastFire = new Map<string, number>()

export function shouldFire(
  nodeId: string,
  binding: HAEntityBinding,
  trigger: 'tap' | 'longPress',
): boolean {
  const key = `${nodeId}::${binding.entityId}::${trigger}`
  const now = performance.now()
  const last = lastFire.get(key) ?? 0
  if (now - last < DEBOUNCE_MS) return false
  lastFire.set(key, now)
  return true
}

export function _resetDebounce() {
  lastFire.clear()
}
