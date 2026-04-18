import { describe, expect, test, beforeEach, mock } from 'bun:test'
import {
  TOGGLE_DOMAINS,
  _resetPopupWarnedEntities,
  dispatchAction,
  validateAction,
} from './action-handlers'
import type { HAEntityBinding } from './schema'

// Mock the ha-bridge `callService` so tests can assert whether the dispatcher
// reached out to HA. The spy is module-level so we can reset/inspect it in each
// test. We use `mock.module` to intercept the import at module-resolution time.
const callServiceSpy = mock(async () => {})
mock.module('@maison-3d/ha-bridge', () => ({
  callService: callServiceSpy,
}))

const binding = (overrides: Partial<HAEntityBinding> = {}): HAEntityBinding => ({
  entityId: 'light.salon',
  domain: 'light',
  ...overrides,
})

describe('validateAction', () => {
  let errors: string[] = []
  beforeEach(() => {
    errors = []
    console.error = (msg: string) => errors.push(msg)
  })

  test('returns false and logs nothing for undefined action', () => {
    expect(validateAction('n1', binding(), 'tap', undefined)).toBe(false)
    expect(errors).toEqual([])
  })

  test('returns false for kind: none', () => {
    expect(validateAction('n1', binding(), 'tap', { kind: 'none' })).toBe(false)
  })

  test('toggle on allowed domain returns true', () => {
    expect(validateAction('n1', binding({ domain: 'light' }), 'tap', { kind: 'toggle' })).toBe(true)
  })

  test('toggle on disallowed domain returns false and errors', () => {
    expect(validateAction('n1', binding({ domain: 'climate' }), 'tap', { kind: 'toggle' })).toBe(false)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain("toggle not supported for domain 'climate'")
  })

  test('popup returns false and errors (v1 not implemented)', () => {
    expect(validateAction('n1', binding(), 'tap', { kind: 'popup', popupType: 'brightness' })).toBe(false)
    expect(errors[0]).toContain("popup")
  })

  test('navigate returns false and errors (v1 not implemented)', () => {
    expect(validateAction('n1', binding(), 'tap', { kind: 'navigate', to: '/x' })).toBe(false)
  })

  test('call_service returns true', () => {
    expect(validateAction('n1', binding(), 'tap', {
      kind: 'call_service', domain: 'light', service: 'turn_on',
    })).toBe(true)
  })
})

describe('TOGGLE_DOMAINS', () => {
  test('contains expected safe domains', () => {
    for (const d of ['light', 'switch', 'fan', 'cover', 'input_boolean', 'automation', 'group']) {
      expect(TOGGLE_DOMAINS.has(d)).toBe(true)
    }
  })

  test('excludes climate/media_player/lock/scene/script', () => {
    for (const d of ['climate', 'media_player', 'lock', 'scene', 'script']) {
      expect(TOGGLE_DOMAINS.has(d)).toBe(false)
    }
  })
})

describe('dispatchAction — kiosk scope', () => {
  let warnings: string[] = []
  let originalWarn: typeof console.warn

  beforeEach(() => {
    callServiceSpy.mockClear()
    _resetPopupWarnedEntities()
    warnings = []
    originalWarn = console.warn
    console.warn = (msg: string) => {
      warnings.push(msg)
    }
  })

  test('popup action in kiosk scope does not call HA service', () => {
    const result = dispatchAction(
      { kind: 'popup', popupType: 'brightness' },
      binding({ entityId: 'light.salon' }),
      { scope: 'kiosk' },
    )

    expect(result).toBeUndefined()
    expect(callServiceSpy).not.toHaveBeenCalled()
    console.warn = originalWarn
  })

  test('popup action in kiosk scope emits a console.warn', () => {
    dispatchAction(
      { kind: 'popup', popupType: 'brightness' },
      binding({ entityId: 'light.cuisine' }),
      { scope: 'kiosk' },
    )

    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain('popup action ignored in kiosk scope')
    expect(warnings[0]).toContain('light.cuisine')
    console.warn = originalWarn
  })

  test('popup warn is emitted at most once per entityId', () => {
    const b = binding({ entityId: 'light.salon' })
    dispatchAction({ kind: 'popup', popupType: 'brightness' }, b, { scope: 'kiosk' })
    dispatchAction({ kind: 'popup', popupType: 'brightness' }, b, { scope: 'kiosk' })
    dispatchAction({ kind: 'popup', popupType: 'climate' }, b, { scope: 'kiosk' })

    expect(warnings.length).toBe(1)

    // A different entity should produce its own (single) warn.
    dispatchAction(
      { kind: 'popup', popupType: 'brightness' },
      binding({ entityId: 'light.chambre' }),
      { scope: 'kiosk' },
    )
    expect(warnings.length).toBe(2)
    console.warn = originalWarn
  })

  test('toggle action in kiosk scope still dispatches to HA', async () => {
    const result = dispatchAction(
      { kind: 'toggle' },
      binding({ entityId: 'light.salon', domain: 'light' }),
      { scope: 'kiosk' },
    )

    expect(result).toBeDefined()
    await result
    expect(callServiceSpy).toHaveBeenCalledTimes(1)
    console.warn = originalWarn
  })

  test('default scope (editor) does not suppress popup via dispatchAction', () => {
    // Note: editor-level validation already blocks popup at registration time;
    // dispatchAction defensively returns undefined when no handler is
    // registered (popup's HANDLERS entry is null in v1). We assert no warn
    // and no service call — matching the existing editor semantics.
    dispatchAction(
      { kind: 'popup', popupType: 'brightness' },
      binding({ entityId: 'light.salon' }),
    )

    expect(warnings.length).toBe(0)
    expect(callServiceSpy).not.toHaveBeenCalled()
    console.warn = originalWarn
  })
})
