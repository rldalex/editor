import { describe, it, expect, beforeEach } from 'bun:test'
import { useConfigStore } from './config-store'

describe('config-store', () => {
  beforeEach(() => {
    useConfigStore.setState({
      haUrl: null,
      haToken: null,
      bundleMeta: null,
      houseName: null,
    })
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  it('persists setHAConfig across read', () => {
    useConfigStore.getState().setHAConfig('http://a', 't')
    expect(useConfigStore.getState().haUrl).toBe('http://a')
    expect(useConfigStore.getState().haToken).toBe('t')
  })

  it('clearHAConfig nulls url+token but preserves bundleMeta', () => {
    useConfigStore.getState().setHAConfig('http://a', 't')
    // Set a minimal valid bundleMeta shape
    useConfigStore.setState({
      bundleMeta: {
        version: 1,
        format: 'maison3d',
        createdAt: '2026-04-18T10:00:00Z',
        createdBy: { app: 'editor', version: '0.1.0' },
        scene: { nodeCount: 0, rootCount: 0 },
        ha: { bindingCount: 0, entities: [] },
        assets: [],
      },
    })
    useConfigStore.getState().clearHAConfig()
    expect(useConfigStore.getState().haUrl).toBeNull()
    expect(useConfigStore.getState().haToken).toBeNull()
    expect(useConfigStore.getState().bundleMeta).not.toBeNull()
  })

  it('setBundleMeta updates houseName from manifest', () => {
    useConfigStore.getState().setBundleMeta({
      version: 1,
      format: 'maison3d',
      createdAt: '2026-04-18T10:00:00Z',
      createdBy: { app: 'editor', version: '0.1.0' },
      scene: { nodeCount: 1, rootCount: 1, houseName: 'Villa Test' },
      ha: { bindingCount: 0, entities: [] },
      assets: [],
    })
    expect(useConfigStore.getState().houseName).toBe('Villa Test')
  })

  it('setBundleMeta with no houseName falls back to null', () => {
    useConfigStore.getState().setBundleMeta({
      version: 1,
      format: 'maison3d',
      createdAt: '2026-04-18T10:00:00Z',
      createdBy: { app: 'editor', version: '0.1.0' },
      scene: { nodeCount: 0, rootCount: 0 }, // no houseName
      ha: { bindingCount: 0, entities: [] },
      assets: [],
    })
    expect(useConfigStore.getState().houseName).toBeNull()
  })
})
