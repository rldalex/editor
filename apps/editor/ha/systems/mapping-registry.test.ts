import { describe, expect, test } from 'bun:test'
import { collectHAMappings, reconcileMappings } from './mapping-registry'
import type { HAEntityBinding } from '../schema'

const makeItem = (id: string, bindings?: HAEntityBinding[]): any => ({
  id, type: 'item', object: 'node', parentId: null, position: [0,0,0], rotation: 0,
  asset: { src: '', dimensions: [1,1,1], offset: [0,0,0], rotation: [0,0,0] },
  metadata: bindings ? { ha: { bindings } } : {},
  children: [], visible: true,
})

const bindingA: HAEntityBinding = {
  entityId: 'light.salon', domain: 'light',
  visual: { kind: 'emissive', onColor: '#ffaa00' },
}
const bindingB: HAEntityBinding = {
  entityId: 'light.cuisine', domain: 'light',
  visual: { kind: 'emissive', onColor: '#ffffff' },
}

describe('collectHAMappings', () => {
  test('skips nodes without ha metadata', () => {
    const nodes = { a: makeItem('a'), b: makeItem('b', [bindingA]) }
    const map = collectHAMappings(nodes)
    expect(map.size).toBe(1)
    expect(map.get('b')).toEqual([bindingA])
  })

  test('skips non-item node types', () => {
    const walls = { w: { ...makeItem('w', [bindingA]), type: 'wall' } }
    const map = collectHAMappings(walls)
    expect(map.size).toBe(0)
  })

  test('empty bindings array is skipped', () => {
    const nodes = { a: { ...makeItem('a'), metadata: { ha: { bindings: [] } } } }
    expect(collectHAMappings(nodes).size).toBe(0)
  })
})

describe('reconcileMappings', () => {
  test('added node fires onAdd for each binding', () => {
    const prev = new Map()
    const next = new Map([['a', [bindingA, bindingB]]])
    const adds: Array<[string, HAEntityBinding]> = []
    reconcileMappings(prev, next, {
      onAdd: (id, b) => adds.push([id, b]),
      onRemove: () => {},
      onChange: () => {},
    })
    expect(adds).toEqual([['a', bindingA], ['a', bindingB]])
  })

  test('removed node fires onRemove for each binding', () => {
    const prev = new Map([['a', [bindingA]]])
    const next = new Map()
    const removes: Array<[string, HAEntityBinding]> = []
    reconcileMappings(prev, next, {
      onAdd: () => {},
      onRemove: (id, b) => removes.push([id, b]),
      onChange: () => {},
    })
    expect(removes).toEqual([['a', bindingA]])
  })

  test('changed binding fires onChange', () => {
    const b1: HAEntityBinding = { ...bindingA, visual: { kind: 'emissive', onColor: '#ff0000' } }
    const b2: HAEntityBinding = { ...bindingA, visual: { kind: 'emissive', onColor: '#00ff00' } }
    const prev = new Map([['a', [b1]]])
    const next = new Map([['a', [b2]]])
    const changes: Array<[string, HAEntityBinding]> = []
    reconcileMappings(prev, next, {
      onAdd: () => {},
      onRemove: () => {},
      onChange: (id, b) => changes.push([id, b]),
    })
    expect(changes).toEqual([['a', b2]])
  })

  test('identical mappings fire nothing', () => {
    const prev = new Map([['a', [bindingA]]])
    const next = new Map([['a', [bindingA]]])
    let events = 0
    reconcileMappings(prev, next, {
      onAdd: () => events++, onRemove: () => events++, onChange: () => events++,
    })
    expect(events).toBe(0)
  })

  test('binding added to existing node fires onAdd (not onChange)', () => {
    const prev = new Map([['a', [bindingA]]])
    const next = new Map([['a', [bindingA, bindingB]]])
    const adds: Array<[string, HAEntityBinding]> = []
    reconcileMappings(prev, next, {
      onAdd: (id, b) => adds.push([id, b]),
      onRemove: () => {}, onChange: () => {},
    })
    expect(adds).toEqual([['a', bindingB]])
  })
})
