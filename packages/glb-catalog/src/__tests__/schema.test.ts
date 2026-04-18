import { describe, expect, test } from 'bun:test'
import {
  Category,
  GLBAsset,
  HADomainHint,
} from '../schema'

describe('Category', () => {
  test('accepts all valid categories', () => {
    for (const v of ['light', 'cover', 'sensor', 'furniture', 'uncategorized']) {
      expect(() => Category.parse(v)).not.toThrow()
    }
  })
  test('rejects unknown category', () => {
    expect(() => Category.parse('appliance')).toThrow()
  })
})

describe('HADomainHint', () => {
  test('accepts all domain hints + null', () => {
    for (const v of ['light', 'switch', 'cover', 'fan', 'climate', 'sensor', null]) {
      expect(() => HADomainHint.parse(v)).not.toThrow()
    }
  })
  test('rejects unknown domain', () => {
    expect(() => HADomainHint.parse('media_player')).toThrow()
  })
})

describe('GLBAsset', () => {
  test('parses a minimal valid asset', () => {
    const parsed = GLBAsset.parse({
      id: 'abc123',
      builtin: false,
      name: 'Test',
      category: 'light',
      suggestedHADomain: 'light',
      filename: 'test.glb',
      meshNames: ['light_a'],
      pascalAssetUrl: 'asset://uuid-xyz',
      createdAt: 0,
      updatedAt: 0,
    })
    expect(parsed.id).toBe('abc123')
  })
  test('rejects missing required fields', () => {
    expect(() => GLBAsset.parse({ id: 'abc' })).toThrow()
  })
})
