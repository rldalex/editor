import { describe, expect, test } from 'bun:test'
import { suggestCategoryAndDomain } from './suggest'

describe('suggestCategoryAndDomain', () => {
  test('light_ prefix → light category + light domain', () => {
    expect(suggestCategoryAndDomain('light_salon')).toEqual({
      category: 'light',
      domain: 'light',
    })
  })
  test('volet_ prefix → cover + cover', () => {
    expect(suggestCategoryAndDomain('volet_cuisine')).toEqual({
      category: 'cover',
      domain: 'cover',
    })
  })
  test('thermostat_ prefix matches before capteur_ hypothetical', () => {
    expect(suggestCategoryAndDomain('thermostat_salon')).toEqual({
      category: 'sensor',
      domain: 'climate',
    })
  })
  test('prise_ prefix → furniture + switch (divergence category/domain)', () => {
    expect(suggestCategoryAndDomain('prise_bureau')).toEqual({
      category: 'furniture',
      domain: 'switch',
    })
  })
  test('media_ prefix → furniture + null (subset v1 exclut media_player)', () => {
    expect(suggestCategoryAndDomain('media_tv')).toEqual({
      category: 'furniture',
      domain: null,
    })
  })
  test('unknown prefix → uncategorized + null', () => {
    expect(suggestCategoryAndDomain('unknown_foo')).toEqual({
      category: 'uncategorized',
      domain: null,
    })
  })
  test('case-insensitive', () => {
    expect(suggestCategoryAndDomain('LIGHT_SALON')).toEqual({
      category: 'light',
      domain: 'light',
    })
  })
})
