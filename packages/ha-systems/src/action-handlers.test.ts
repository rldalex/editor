import { describe, expect, test, beforeEach } from 'bun:test'
import { TOGGLE_DOMAINS, validateAction } from './action-handlers'
import type { HAEntityBinding } from './schema'

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
