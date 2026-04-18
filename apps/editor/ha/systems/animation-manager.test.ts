import { describe, expect, test, beforeEach } from 'bun:test'
import { animationManager } from './animation-manager'

describe('animation-manager', () => {
  beforeEach(() => animationManager._reset())

  // Tests use _pushAt + _tickAt to inject deterministic timestamps. The
  // module-level `performance.now()` would otherwise make results depend
  // on real wall-clock between push and tick calls.

  test('push then tick progresses value toward target', () => {
    let observed = 0
    animationManager._pushAt({
      id: 'a',
      nodeId: 'n1',
      property: 'scale',
      from: 1.0,
      to: 2.0,
      duration: 100,
      easing: 'linear',
      target: { set: (v: number) => { observed = v } },
    }, 0)
    animationManager._tickAt(0)
    expect(observed).toBeCloseTo(1.0, 3)
    animationManager._tickAt(50)
    expect(observed).toBeCloseTo(1.5, 3)
    animationManager._tickAt(100)
    expect(observed).toBeCloseTo(2.0, 3)
  })

  test('same id cancels and replaces, from = current value', () => {
    let observed = 0
    const target = { set: (v: number) => { observed = v } }
    animationManager._pushAt({
      id: 'a', nodeId: 'n1', property: 'scale',
      from: 1.0, to: 2.0, duration: 100, easing: 'linear', target,
    }, 0)
    animationManager._tickAt(50) // observed ~= 1.5
    animationManager._pushAt({
      id: 'a', nodeId: 'n1', property: 'scale',
      from: 1.0, to: 0.0, duration: 100, easing: 'linear', target,
    }, 50)
    animationManager._tickAt(50) // 0ms into new anim → still 1.5
    expect(observed).toBeCloseTo(1.5, 2)
    animationManager._tickAt(150) // 100ms into new anim → 0.0
    expect(observed).toBeCloseTo(0.0, 2)
  })

  test('onComplete fires at t=1 and anim is removed', () => {
    let completed = false
    animationManager._pushAt({
      id: 'a', nodeId: 'n1', property: 'scale',
      from: 0, to: 1, duration: 100, easing: 'linear',
      target: { set: () => {} },
      onComplete: () => { completed = true },
    }, 0)
    animationManager._tickAt(100)
    expect(completed).toBe(true)
    expect(animationManager._activeCount()).toBe(0)
  })

  test('easeOutCubic reaches exactly 1 at t=1', () => {
    let observed = 0
    animationManager._pushAt({
      id: 'a', nodeId: 'n1', property: 'scale',
      from: 0, to: 1, duration: 100, easing: 'easeOutCubic',
      target: { set: (v: number) => { observed = v } },
    }, 0)
    animationManager._tickAt(100)
    expect(observed).toBeCloseTo(1, 5)
  })

  test('empty active stops RAF (no leak, no real RAF scheduled in test mode)', () => {
    animationManager._pushAt({
      id: 'a', nodeId: 'n1', property: 'scale',
      from: 0, to: 1, duration: 100, easing: 'linear',
      target: { set: () => {} },
    }, 0)
    animationManager._tickAt(100)
    expect(animationManager._rafId()).toBe(null)
  })
})
