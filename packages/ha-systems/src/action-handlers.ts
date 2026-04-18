import { callService } from '@maison-3d/ha-bridge'
import type { HAAction, HAEntityBinding } from './schema'

export const TOGGLE_DOMAINS = new Set([
  'light', 'switch', 'fan', 'cover',
  'input_boolean', 'automation', 'group',
])

export type ActionHandler = (
  binding: HAEntityBinding,
  action: HAAction,
) => Promise<void>

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
