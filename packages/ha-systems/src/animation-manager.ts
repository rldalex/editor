type Easing = 'linear' | 'easeOutCubic' | 'easeInOutCubic'
type Property = 'scale' | 'emissive' | 'emissiveIntensity'

export type AnimationTarget = {
  set: (value: number) => void
}

export type AnimationSpec = {
  id: string
  nodeId: string
  property: Property
  from: number
  to: number
  duration: number
  easing: Easing
  target: AnimationTarget
  onComplete?: () => void
}

type ActiveAnim = AnimationSpec & { startTime: number; currentValue: number }

const active = new Map<string, ActiveAnim>()
let rafId: number | null = null
let invalidateFn: () => void = () => {}
let testMode = false // when true, tickAt does not schedule real RAF

function applyEasing(t: number, easing: Easing): number {
  if (easing === 'linear') return t
  if (easing === 'easeOutCubic') return 1 - Math.pow(1 - t, 3)
  if (easing === 'easeInOutCubic') {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }
  return t
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function tickAt(now: number) {
  for (const anim of [...active.values()]) {
    const elapsed = now - anim.startTime
    const t = clamp(elapsed / anim.duration, 0, 1)
    const eased = applyEasing(t, anim.easing)
    anim.currentValue = anim.from + (anim.to - anim.from) * eased
    anim.target.set(anim.currentValue)
    if (t === 1) {
      active.delete(anim.id)
      anim.onComplete?.()
    }
  }
  invalidateFn()
  if (active.size === 0) {
    rafId = null
  } else if (!testMode) {
    rafId = requestAnimationFrame((t) => tickAt(t))
  }
}

function pushInternal(spec: AnimationSpec, startTime: number) {
  const existing = active.get(spec.id)
  const from = existing ? existing.currentValue : spec.from
  active.set(spec.id, {
    ...spec,
    from,
    startTime,
    currentValue: from,
  })
  if (rafId === null && !testMode) {
    rafId = requestAnimationFrame((t) => tickAt(t))
  }
}

export const animationManager = {
  setInvalidate(fn: () => void) {
    invalidateFn = fn
  },
  push(spec: AnimationSpec) {
    pushInternal(spec, performance.now())
  },
  _reset() {
    active.clear()
    if (rafId !== null && rafId !== 0) {
      cancelAnimationFrame(rafId)
    }
    rafId = null
    invalidateFn = () => {}
    testMode = false
  },
  _pushAt(spec: AnimationSpec, now: number) {
    testMode = true
    pushInternal(spec, now)
  },
  _tickAt(now: number) {
    testMode = true
    tickAt(now)
  },
  _activeCount() {
    return active.size
  },
  _rafId() {
    return rafId
  },
}
