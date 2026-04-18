# PHASE 5 + 6 — HAVisualSystem + HAInteractionSystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connecter l'état Home Assistant au rendu 3D Pascal (emissive temps
réel) et permettre aux interactions 3D (tap / long-press) de déclencher des
actions HA (`toggle`, `call_service`), sans modifier `packages/core` ni
`packages/viewer`.

**Architecture:** Deux systems React sans rendu (`HAVisualSystem`,
`HAInteractionSystem`) montés hors `<Canvas>` dans `EditorWithHA`. Subscribe
aux stores `haStore` (états HA) et `useScene` (Pascal), mutation directe des
matériaux clonés au niveau mesh via `sceneRegistry`. Coalescing des repaint
via `invalidate()` microtask. Bus mitt Pascal (`item:click`,
`item:pointerdown`, `item:pointerup`, `item:move`, `item:leave`) pour les
interactions, long-press multi-touch synthétisé via `pointerId`.

**Tech Stack:** React 19, Zustand + `subscribeWithSelector`, Three.js WebGPU
(`MeshStandardNodeMaterial`), `@react-three/fiber` (`invalidate`), mitt, bun
test.

**Spec référence:** `docs/superpowers/specs/2026-04-18-ha-visual-interaction-systems-design.md`

**Invariants verified upfront (pre-Task 1) :**
- Pascal emits `item:leave` (confirmed in `packages/core/src/events/bus.ts:65`
  — `leave` is in `eventSuffixes`).
- `MeshStandardNodeMaterial` has no custom `emissiveNode` in Pascal's
  `baseMaterial` (`packages/core/src/materials.ts:6-10`) — plain `emissive`
  Color inherited from `Material`. Task 1 smoke test confirms `.clone()`
  isolates it per-instance.

---

## File Structure

### Nouveaux fichiers

```
apps/editor/ha/systems/
├── animation-manager.ts            # singleton RAF on/off, cancel+replace
├── animation-manager.test.ts       # bun:test
├── mapping-registry.ts             # collectHAMappings + reconcileMappings
├── mapping-registry.test.ts        # bun:test
├── target-resolver.ts              # regex mesh + fallback Group + clone
├── emissive-visual.ts              # applyEmissiveState, pre-parse colors
├── action-handlers.ts              # HANDLERS toggle / call_service + validateAction
├── action-handlers.test.ts         # bun:test (validateAction, debounce)
├── HAVisualSystem.tsx              # composant React sans rendu
├── HAInteractionSystem.tsx         # composant React sans rendu
└── index.ts                        # re-exports
```

### Modifs externes

- `packages/ha-bridge/src/store.ts` — ajouter middleware `subscribeWithSelector`
- `apps/editor/ha/EditorWithHA.tsx` — monter `<HAVisualSystem />` et
  `<HAInteractionSystem />` siblings de `<HABootstrap />`
- `CHANGELOG.md` — entrée PHASE 5 + 6

### Non-modifications

- `packages/core/*`, `packages/viewer/*` — zéro touch
- `apps/editor/ha/schema.ts` — inchangé (schema déjà complet)
- `apps/editor/ha/mapping-helpers.ts` — inchangé

---

## Task 1 : Smoke test isolation `MeshStandardNodeMaterial.clone()` (GATE)

**Objectif :** Avant d'écrire tout le reste, valider que le clone de
`baseMaterial` isole bien `emissive` sur chaque instance. Si le smoke test
échoue, on applique le fallback `mat.emissive = mat.emissive.clone()` dans
Task 5 (`target-resolver.ts`).

**Files:**
- Test manuel à exécuter dans `/ha-test` page (via DevTools console ou
  ajouter un bouton temporaire)

- [ ] **Step 1: Ouvrir `/ha-test` dans le navigateur**

```bash
bun dev
# Puis naviguer vers http://localhost:3002/ha-test
```

- [ ] **Step 2: Exécuter le smoke test dans la console DevTools**

```js
const { baseMaterial } = await import('@pascal-app/core')
const { Color } = await import('three/webgpu')

const a = baseMaterial.clone()
const b = baseMaterial.clone()
a.emissive.set('#ff0000')
console.log('a.emissive:', a.emissive.getHex().toString(16))
console.log('b.emissive:', b.emissive.getHex().toString(16))
console.log('a === b:', a === b)
console.log('a.emissive === b.emissive:', a.emissive === b.emissive)
console.log('a.emissive === baseMaterial.emissive:', a.emissive === baseMaterial.emissive)
```

- [ ] **Step 3: Valider le résultat attendu**

Attendu :
- `a.emissive: ff0000`
- `b.emissive: 0` (ou la valeur par défaut du matériau)
- `a === b: false`
- `a.emissive === b.emissive: false`
- `a.emissive === baseMaterial.emissive: false`

**Si b.emissive est aussi `ff0000`** : le clone partage la ref Color.
Documenter dans un commentaire dans Task 5 et appliquer le fallback
`mat.emissive = mat.emissive.clone()` après chaque `mat = mat.clone()`.

- [ ] **Step 4: Noter le résultat dans le CHANGELOG**

Pas de commit ici, juste consigner le résultat pour informer Task 5.

---

## Task 2 : Ajouter `subscribeWithSelector` sur `haStore`

**Objectif :** Permettre `haStore.subscribe(selector, handler, options)`
natif avec `fireImmediately`, `equalityFn`. Rétro-compat garantie — les
`useHAStore(s => s.x)` existants inchangés.

**Files:**
- Modify: `packages/ha-bridge/src/store.ts`

- [ ] **Step 1: Modifier le store**

```ts
// packages/ha-bridge/src/store.ts
import { createStore, useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { HAArea, HADevice, HAEntity, HAState, HAStatus } from './types'

export interface HABridgeState {
  status: HAStatus
  error: string | null
  states: Record<string, HAState>
  entities: Record<string, HAEntity>
  areas: Record<string, HAArea>
  devices: Record<string, HADevice>
}

export interface HABridgeActions {
  setStatus: (status: HAStatus, error?: string | null) => void
  setStates: (states: Record<string, HAState>) => void
  patchState: (entityId: string, state: HAState) => void
  removeState: (entityId: string) => void
  setEntities: (entities: HAEntity[]) => void
  setAreas: (areas: HAArea[]) => void
  setDevices: (devices: HADevice[]) => void
  reset: () => void
}

const initialState: HABridgeState = {
  status: 'disconnected',
  error: null,
  states: {},
  entities: {},
  areas: {},
  devices: {},
}

export const haStore = createStore<HABridgeState & HABridgeActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,
    setStatus: (status, error = null) => set({ status, error }),
    setStates: (states) => set({ states }),
    patchState: (entityId, state) =>
      set((s) => ({ states: { ...s.states, [entityId]: state } })),
    removeState: (entityId) =>
      set((s) => {
        const next = { ...s.states }
        delete next[entityId]
        return { states: next }
      }),
    setEntities: (entities) =>
      set({
        entities: Object.fromEntries(entities.map((e) => [e.entity_id, e])),
      }),
    setAreas: (areas) =>
      set({ areas: Object.fromEntries(areas.map((a) => [a.area_id, a])) }),
    setDevices: (devices) =>
      set({ devices: Object.fromEntries(devices.map((d) => [d.id, d])) }),
    reset: () => set(initialState),
  }))
)

export const useHAStore = <T,>(
  selector: (s: HABridgeState & HABridgeActions) => T,
): T => useStore(haStore, selector)
```

- [ ] **Step 2: Vérifier que `/ha-test` fonctionne toujours**

```bash
bun dev
# Ouvrir http://localhost:3002/ha-test
# Vérifier : statut "connected", liste d'entités affichée, toggle lampe OK.
```

Attendu : aucune régression des hooks existants.

- [ ] **Step 3: Commit**

```bash
git add packages/ha-bridge/src/store.ts
git commit -m "feat(ha-bridge): add subscribeWithSelector middleware to haStore

Enables haStore.subscribe(selector, handler, { fireImmediately, equalityFn })
for the upcoming HAVisualSystem. Fully backwards-compatible — existing
useHAStore(s => s.x) hooks unchanged."
```

---

## Task 3 : `animation-manager.ts` — singleton RAF partagé

**Objectif :** Module pur testable, RAF on/off automatique, cancel+replace
sur re-push. Utilisé par HAVisualSystem (pas en v1) et HAInteractionSystem
(feedback scale au tap).

**Files:**
- Create: `apps/editor/ha/systems/animation-manager.ts`
- Create: `apps/editor/ha/systems/animation-manager.test.ts`

- [ ] **Step 1: Écrire les tests (échec attendu)**

```ts
// apps/editor/ha/systems/animation-manager.test.ts
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
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd apps/editor/ha/systems && bun test animation-manager.test.ts
```
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/editor/ha/systems/animation-manager.ts
type Easing = 'linear' | 'easeOutCubic' | 'easeInOutCubic'
type Property = 'scale' | 'emissive' | 'emissiveIntensity'

export type AnimationTarget = {
  // Minimal interface — production impl passes a writer function that knows
  // how to apply value to the actual THREE object (group.scale.setScalar, etc.)
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
  // In testMode, we never schedule a real RAF — tests drive ticks manually
  // via _tickAt. Without this guard, a real frame races with the test and
  // mutates state between assertions.
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
  // Test-only helpers (underscore-prefixed so consumer code doesn't touch)
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/editor/ha/systems && bun test animation-manager.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/editor/ha/systems/animation-manager.ts apps/editor/ha/systems/animation-manager.test.ts
git commit -m "feat(ha): animation-manager singleton with cancel+replace

RAF auto-start/stop, linear + easeOutCubic + easeInOutCubic easings,
cancel+replace on same id uses current interpolated value as new 'from'
(no visual jumps). Target abstracted via { set(v) } writer for testability.
Consumed by feedback scale pulse in HAInteractionSystem and future
cover/color/label animations."
```

---

## Task 4 : `mapping-registry.ts` — collect + reconcile partagés

**Objectif :** Deux helpers purs réutilisés par HAVisualSystem et
HAInteractionSystem. `collectHAMappings` extrait tous les `ItemNode` avec
`metadata.ha`. `reconcileMappings` diffuse des callbacks `onAdd`, `onRemove`,
`onChange` au diff prev vs next.

**Files:**
- Create: `apps/editor/ha/systems/mapping-registry.ts`
- Create: `apps/editor/ha/systems/mapping-registry.test.ts`

- [ ] **Step 1: Écrire les tests (échec attendu)**

```ts
// apps/editor/ha/systems/mapping-registry.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/editor/ha/systems && bun test mapping-registry.test.ts
```
Expected: FAIL module not found.

- [ ] **Step 3: Write implementation**

```ts
// apps/editor/ha/systems/mapping-registry.ts
import type { AnyNode, AnyNodeId, ItemNode } from '@pascal-app/core'
import type { HAEntityBinding } from '../schema'
import { getHAMapping } from '../mapping-helpers'

export type MappingMap = Map<AnyNodeId, HAEntityBinding[]>

export function collectHAMappings(
  nodes: Record<AnyNodeId, AnyNode>,
): MappingMap {
  const map: MappingMap = new Map()
  for (const node of Object.values(nodes)) {
    if (node.type !== 'item') continue
    const mapping = getHAMapping(node as ItemNode)
    if (!mapping || mapping.bindings.length === 0) continue
    map.set(node.id, mapping.bindings)
  }
  return map
}

export type ReconcileCallbacks = {
  onAdd: (nodeId: AnyNodeId, binding: HAEntityBinding) => void
  onRemove: (nodeId: AnyNodeId, binding: HAEntityBinding) => void
  onChange: (nodeId: AnyNodeId, binding: HAEntityBinding) => void
}

// Binding key for identity: entityId is the stable identifier within a node.
// Two bindings with same entityId = same logical binding (edited).
const bindingKey = (b: HAEntityBinding) => b.entityId

// Shallow structural compare. Sufficient for detecting user edits in the
// mapping panel (which mutates the binding object via setHAMapping).
function bindingsEqual(a: HAEntityBinding, b: HAEntityBinding): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function reconcileMappings(
  prev: MappingMap,
  next: MappingMap,
  cb: ReconcileCallbacks,
): void {
  // 1. Removed nodes entirely
  for (const [nodeId, bindings] of prev) {
    if (!next.has(nodeId)) {
      for (const b of bindings) cb.onRemove(nodeId, b)
    }
  }
  // 2. Added nodes entirely
  for (const [nodeId, bindings] of next) {
    if (!prev.has(nodeId)) {
      for (const b of bindings) cb.onAdd(nodeId, b)
    }
  }
  // 3. Nodes present both sides — diff bindings
  for (const [nodeId, nextBindings] of next) {
    const prevBindings = prev.get(nodeId)
    if (!prevBindings) continue
    const prevByKey = new Map(prevBindings.map((b) => [bindingKey(b), b]))
    const nextByKey = new Map(nextBindings.map((b) => [bindingKey(b), b]))
    for (const [key, nextB] of nextByKey) {
      const prevB = prevByKey.get(key)
      if (!prevB) cb.onAdd(nodeId, nextB)
      else if (!bindingsEqual(prevB, nextB)) cb.onChange(nodeId, nextB)
    }
    for (const [key, prevB] of prevByKey) {
      if (!nextByKey.has(key)) cb.onRemove(nodeId, prevB)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/editor/ha/systems && bun test mapping-registry.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/editor/ha/systems/mapping-registry.ts apps/editor/ha/systems/mapping-registry.test.ts
git commit -m "feat(ha): mapping-registry — collect + reconcile HA bindings

Pure helpers shared by HAVisualSystem and HAInteractionSystem.
collectHAMappings extracts bindings from ItemNode.metadata.ha;
reconcileMappings diffs prev/next MappingMaps and fires onAdd/onRemove/
onChange callbacks. Binding identity = entityId, shape diff via JSON
deep-compare. Enables panel-edit reactivity without remount."
```

---

## Task 5 : `target-resolver.ts` — regex mesh + clone matériau

**Objectif :** Résoudre les meshes cibles pour la mutation emissive. Regex
`/glow|emissive|_emit$/i` avec fallback Group entier. Clone matériau au
niveau mesh pour isoler des singletons Pascal.

**Files:**
- Create: `apps/editor/ha/systems/target-resolver.ts`

- [ ] **Step 1: Écrire l'implémentation**

```ts
// apps/editor/ha/systems/target-resolver.ts
import { sceneRegistry } from '@pascal-app/core'
import type { AnyNodeId } from '@pascal-app/core'
import type { Mesh, Material } from 'three'

const EMISSIVE_MESH_REGEX = /glow|emissive|_emit$/i

/**
 * Resolve mutation targets for a mapped node.
 *
 * Returns `null` if the Group is not yet registered (GLB not loaded).
 * Caller should push the binding into the pending queue in that case.
 *
 * On success, clones each target mesh's material so that mutations don't
 * bleed into Pascal's global `baseMaterial` / `glassMaterial` singletons
 * (see packages/core/src/materials.ts).
 *
 * Selection strategy:
 *   1. Collect all descendant meshes of the Group.
 *   2. If any match /glow|emissive|_emit$/i, keep only those.
 *   3. Otherwise, fall back to all meshes (the whole item glows).
 *
 * NOTE: If smoke test (Task 1) showed clone() shared emissive Color
 * references across instances, add `mat.emissive = mat.emissive.clone()`
 * after the clone below.
 */
export function resolveTargets(nodeId: AnyNodeId): Mesh[] | null {
  const group = sceneRegistry.nodes.get(nodeId as string)
  if (!group) return null

  const allMeshes: Mesh[] = []
  group.traverse((c) => {
    if ((c as Mesh).isMesh) allMeshes.push(c as Mesh)
  })
  if (allMeshes.length === 0) return null

  const matched = allMeshes.filter((m) => EMISSIVE_MESH_REGEX.test(m.name))
  const targets = matched.length > 0 ? matched : allMeshes

  for (const mesh of targets) {
    const m = mesh.material
    if (Array.isArray(m)) {
      mesh.material = m.map((x: Material) => x.clone())
    } else {
      mesh.material = (m as Material).clone()
    }
  }

  return targets
}
```

- [ ] **Step 2: Type-check (pas de test runtime sans Three.js setup)**

```bash
cd apps/editor && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep "target-resolver" || echo "OK"
```
Expected: `OK` (aucune erreur sur ce fichier).

- [ ] **Step 3: Commit**

```bash
git add apps/editor/ha/systems/target-resolver.ts
git commit -m "feat(ha): target-resolver — mesh filter regex + material clone

Resolves mutation targets for a mapped node. Regex /glow|emissive|_emit\$/i
selects specific meshes (bulb, shade) with fallback to whole Group. Clones
material mesh-level to isolate from Pascal's baseMaterial/glassMaterial
singletons (otherwise muting one emissive illuminates the whole house)."
```

---

## Task 6 : `emissive-visual.ts` — application état HA au matériau

**Objectif :** Helpers purs pour mapper un état HA (`"on"` / `"off"` /
`"unavailable"` / ...) à une mutation `emissive` + `emissiveIntensity`, avec
guard `'emissive' in mat` et warn dev sur `unavailable` / `unknown`.

**Files:**
- Create: `apps/editor/ha/systems/emissive-visual.ts`

- [ ] **Step 1: Écrire l'implémentation**

```ts
// apps/editor/ha/systems/emissive-visual.ts
import { Color } from 'three'
import type { Mesh } from 'three'
import type { HAEmissiveVisual, HAEntityBinding } from '../schema'

export type ParsedEmissive = {
  onColor: Color
  offColor: Color
  intensityOn: number
  intensityOff: number
}

export function parseEmissive(visual: HAEmissiveVisual): ParsedEmissive {
  return {
    onColor: new Color(visual.onColor ?? '#ffaa00'),
    offColor: new Color(visual.offColor ?? '#000000'),
    intensityOn: visual.intensityOn ?? 1.5,
    intensityOff: visual.intensityOff ?? 0,
  }
}

// Warn each entity at most once per "off-like" state to avoid log spam
const warnedUnavailable = new Set<string>()

/**
 * Maps an HA state string to the visual pair (color, intensity) and applies
 * it to all target meshes. Treats unavailable/unknown/undefined as off (v1
 * kiosk policy, see spec §4.5).
 */
export function applyEmissiveState(
  binding: HAEntityBinding,
  parsed: ParsedEmissive,
  targets: Mesh[],
  haState: string | undefined,
): void {
  const isOn = haState === 'on'

  if (haState === 'unavailable' || haState === 'unknown') {
    const key = `${binding.entityId}::${haState}`
    if (!warnedUnavailable.has(key)) {
      console.warn(
        `HAVisualSystem: ${binding.entityId} state=${haState}, treated as off`,
      )
      warnedUnavailable.add(key)
    }
  } else if (haState === 'on' || haState === 'off') {
    // Clear the warn cache so a future unavailable re-warns
    warnedUnavailable.delete(`${binding.entityId}::unavailable`)
    warnedUnavailable.delete(`${binding.entityId}::unknown`)
  }

  const color = isOn ? parsed.onColor : parsed.offColor
  const intensity = isOn ? parsed.intensityOn : parsed.intensityOff

  for (const mesh of targets) {
    const mat = mesh.material
    if (Array.isArray(mat)) {
      for (const m of mat) applyToOne(m, color, intensity, mesh.name)
    } else {
      applyToOne(mat, color, intensity, mesh.name)
    }
  }
}

function applyToOne(
  mat: any,
  color: Color,
  intensity: number,
  meshName: string,
): void {
  if (!('emissive' in mat)) {
    console.warn(
      `HAVisualSystem: mesh "${meshName}" material ${mat.type ?? '?'} has no emissive, skipping`,
    )
    return
  }
  mat.emissive.copy(color)
  if ('emissiveIntensity' in mat) {
    mat.emissiveIntensity = intensity
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/editor && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep "emissive-visual" || echo "OK"
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/editor/ha/systems/emissive-visual.ts
git commit -m "feat(ha): emissive-visual — state → mesh.material mutation

parseEmissive pre-parses hex strings to THREE.Color once at registration
(zero alloc on hot path). applyEmissiveState maps HA state to color+intensity
pair and mutes all target meshes. Treat-as-off for unavailable/unknown/
undefined (v1 kiosk). Warn-once per entity-state transition to avoid log
spam on persistent disconnect."
```

---

## Task 7 : `action-handlers.ts` — dispatcher + validateAction + debounce

**Objectif :** Logique pure de dispatch pour les actions HA. Testable en
isolation (mock de `callService`). Gère `toggle`, `call_service`, `none`.
Valide au registration (domain whitelist pour toggle, kind non-supporté).

**Files:**
- Create: `apps/editor/ha/systems/action-handlers.ts`
- Create: `apps/editor/ha/systems/action-handlers.test.ts`

- [ ] **Step 1: Écrire les tests**

```ts
// apps/editor/ha/systems/action-handlers.test.ts
import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { TOGGLE_DOMAINS, validateAction } from './action-handlers'
import type { HAEntityBinding } from '../schema'

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
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd apps/editor/ha/systems && bun test action-handlers.test.ts
```
Expected: FAIL module not found.

- [ ] **Step 3: Write implementation**

```ts
// apps/editor/ha/systems/action-handlers.ts
import { callService } from '@maison-3d/ha-bridge'
import type { HAAction, HAEntityBinding } from '../schema'

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/editor/ha/systems && bun test action-handlers.test.ts
```
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/editor/ha/systems/action-handlers.ts apps/editor/ha/systems/action-handlers.test.ts
git commit -m "feat(ha): action-handlers — dispatcher + validation + debounce

HANDLERS map with null for popup/navigate (v1 unsupported, throw at
registration). validateAction gates at registration — logs once per bad
binding, not per tap. TOGGLE_DOMAINS whitelist rejects climate/media_player/
lock/scene/script (use call_service instead). shouldFire debounces 300ms
per (nodeId, entityId, trigger) against spam-tap."
```

---

## Task 8 : `HAVisualSystem.tsx` — composant React sans rendu

**Objectif :** Assembler tous les modules précédents en un composant React
qui monte dans `EditorWithHA`, s'abonne à `haStore` et `useScene`, maintient
`registered` + `pending` + drainage 500ms / abandon 30s.

**Files:**
- Create: `apps/editor/ha/systems/HAVisualSystem.tsx`

- [ ] **Step 1: Écrire l'implémentation**

```tsx
// apps/editor/ha/systems/HAVisualSystem.tsx
'use client'

import { useEffect } from 'react'
import { Color, type Mesh } from 'three'
import { invalidate } from '@react-three/fiber'
import { haStore } from '@maison-3d/ha-bridge'
import { useScene } from '@pascal-app/core'
import type { AnyNodeId } from '@pascal-app/core'
import type { HAEntityBinding, HAEmissiveVisual } from '../schema'
import { collectHAMappings, reconcileMappings, type MappingMap } from './mapping-registry'
import { resolveTargets } from './target-resolver'
import { parseEmissive, applyEmissiveState, type ParsedEmissive } from './emissive-visual'

type RegisteredBinding = {
  bindingKey: string
  nodeId: AnyNodeId
  binding: HAEntityBinding
  parsed: ParsedEmissive
  targets: Mesh[] | null
  unsubHA: () => void
}

const PENDING_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 500

// Coalesce invalidate() calls into a single microtask frame.
let invalidateScheduled = false
function scheduleInvalidate() {
  if (invalidateScheduled) return
  invalidateScheduled = true
  queueMicrotask(() => {
    invalidateScheduled = false
    invalidate()
  })
}

export function HAVisualSystem() {
  useEffect(() => {
    const registered = new Map<string, RegisteredBinding>()
    const pending = new Map<string, number>() // bindingKey → firstSeen timestamp

    // Key includes entityId so multiple emissive bindings on the same node
    // (e.g. a lamp with two independent bulbs, each bound to a different
    // HA light entity) are tracked separately. Last-wins applies at the
    // (node, kind, entity) level — editing a binding's color in the panel
    // triggers onChange which unregister+re-register same key.
    const makeKey = (nodeId: AnyNodeId, binding: HAEntityBinding) =>
      `${nodeId}::${binding.visual?.kind}::${binding.entityId}`

    function registerBinding(nodeId: AnyNodeId, binding: HAEntityBinding) {
      if (binding.visual?.kind !== 'emissive') {
        if (binding.visual) {
          console.warn(
            `HAVisualSystem: visual kind '${binding.visual.kind}' not yet ` +
              `supported in v1 (binding on ${nodeId}), skipping`,
          )
        }
        return
      }

      const key = makeKey(nodeId, binding)

      const existing = registered.get(key)
      if (existing) {
        console.warn(`HAVisualSystem: replacing binding on ${key}`)
        existing.unsubHA()
        pending.delete(key)
        registered.delete(key)
      }

      const reg: RegisteredBinding = {
        bindingKey: key,
        nodeId,
        binding,
        parsed: parseEmissive(binding.visual as HAEmissiveVisual),
        targets: null,
        unsubHA: () => {},
      }
      registered.set(key, reg)

      const selector = (s: ReturnType<typeof haStore.getState>) =>
        s.states[binding.entityId]?.state
      reg.unsubHA = haStore.subscribe(
        selector,
        (next, prev) => {
          if (next === prev) return
          applyVisual(reg, next)
        },
        { fireImmediately: true },
      )
    }

    function unregisterBinding(nodeId: AnyNodeId, binding: HAEntityBinding) {
      if (binding.visual?.kind !== 'emissive') return
      const key = makeKey(nodeId, binding)
      const reg = registered.get(key)
      if (!reg) return
      reg.unsubHA()
      pending.delete(key)
      registered.delete(key)
    }

    function applyVisual(reg: RegisteredBinding, haState: string | undefined) {
      if (reg.targets === null) {
        const targets = resolveTargets(reg.nodeId)
        if (targets === null) {
          if (!pending.has(reg.bindingKey)) {
            pending.set(reg.bindingKey, performance.now())
          }
          return
        }
        reg.targets = targets
      }
      applyEmissiveState(reg.binding, reg.parsed, reg.targets, haState)
      scheduleInvalidate()
    }

    function drainPending() {
      if (pending.size === 0) return
      const now = performance.now()
      for (const [key, firstSeen] of pending) {
        const reg = registered.get(key)
        if (!reg) {
          pending.delete(key)
          continue
        }
        const targets = resolveTargets(reg.nodeId)
        if (targets === null) {
          if (now - firstSeen > PENDING_TIMEOUT_MS) {
            console.error(
              `HAVisualSystem: binding ${key} never resolved ` +
                `(nodeId=${reg.nodeId}, entity=${reg.binding.entityId}) — check nodeId`,
            )
            reg.unsubHA()
            pending.delete(key)
            registered.delete(key)
          }
          continue
        }
        reg.targets = targets
        const current = haStore.getState().states[reg.binding.entityId]?.state
        applyEmissiveState(reg.binding, reg.parsed, reg.targets, current)
        scheduleInvalidate()
        pending.delete(key)
      }
    }

    // Initial snapshot
    let prevMappings: MappingMap = collectHAMappings(useScene.getState().nodes)
    for (const [nodeId, bindings] of prevMappings) {
      for (const b of bindings) registerBinding(nodeId, b)
    }

    // Subscribe scene store — reconcile + drainPending on every state change
    // TODO PHASE 5.1: undo/redo zundo can replay same nodeId with orphaned
    // targets. Detect via reg.targets[0]?.parent !== sceneRegistry.nodes.get(id)
    // and invalidate targets.
    const unsubScene = useScene.subscribe((state) => {
      if (pending.size > 0) drainPending()
      const nextMappings = collectHAMappings(state.nodes)
      reconcileMappings(prevMappings, nextMappings, {
        onAdd: registerBinding,
        onRemove: unregisterBinding,
        onChange: (id, b) => {
          unregisterBinding(id, b)
          registerBinding(id, b)
        },
      })
      prevMappings = nextMappings
    })

    // Safety poll for race-mount case B (pointerdown timing of useLayoutEffect)
    const timer = setInterval(drainPending, POLL_INTERVAL_MS)

    // Explicit drain once after all setup — idempotent, covers race case A
    drainPending()

    return () => {
      clearInterval(timer)
      unsubScene()
      for (const reg of registered.values()) reg.unsubHA()
      registered.clear()
      pending.clear()
    }
  }, [])

  return null
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/editor && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep "HAVisualSystem" || echo "OK"
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/editor/ha/systems/HAVisualSystem.tsx
git commit -m "feat(ha): HAVisualSystem — live HA state → mesh.material.emissive

Assembles mapping-registry + target-resolver + emissive-visual into a
React component mounted by EditorWithHA. N-subscribes to haStore per
binding (fireImmediately), reconciles on useScene changes (supports panel
edits + undo via last-wins replace), pending queue for GLB-not-loaded
race, abandon-at-30s for typo detection. Invalidate coalesced via
queueMicrotask for frameloop='demand' compatibility."
```

---

## Task 9 : `HAInteractionSystem.tsx` — composant React sans rendu

**Objectif :** Bus mitt Pascal, phase de registration symétrique à
HAVisualSystem, long-press multi-touch safe, feedback scale au tap.

**Files:**
- Create: `apps/editor/ha/systems/HAInteractionSystem.tsx`

- [ ] **Step 1: Écrire l'implémentation**

```tsx
// apps/editor/ha/systems/HAInteractionSystem.tsx
'use client'

import { useEffect } from 'react'
import { invalidate } from '@react-three/fiber'
import { emitter, sceneRegistry, useScene } from '@pascal-app/core'
import type { AnyNodeId, ItemEvent } from '@pascal-app/core'
import type { HAEntityBinding } from '../schema'
import { collectHAMappings, reconcileMappings, type MappingMap } from './mapping-registry'
import { HANDLERS, shouldFire, validateAction } from './action-handlers'
import { animationManager } from './animation-manager'

type RegisteredAction = {
  binding: HAEntityBinding
  validTap: boolean
  validLongPress: boolean
}

const LONG_PRESS_MS = 500
const MOVE_THRESHOLD_PX = 8

type PressEntry = {
  nodeId: AnyNodeId
  startX: number
  startY: number
  timer: ReturnType<typeof setTimeout>
}

// Configure animationManager to trigger R3F repaints via invalidate().
// Safe to call multiple times (idempotent setter).
animationManager.setInvalidate(() => invalidate())

function triggerVisualFeedback(nodeId: AnyNodeId) {
  const group = sceneRegistry.nodes.get(nodeId as string)
  if (!group) return
  // Pulse scale 1.0 → 1.05 → 1.0 over 150ms on the whole Group.
  const target = {
    set: (v: number) => {
      group.scale.setScalar(v)
    },
  }
  animationManager.push({
    id: `feedback::${nodeId}`, // same id → cancel+replace absorbs spam-tap
    nodeId: nodeId as string,
    property: 'scale',
    from: 1.0,
    to: 1.05,
    duration: 75,
    easing: 'easeOutCubic',
    target,
    onComplete: () => {
      animationManager.push({
        id: `feedback::${nodeId}`,
        nodeId: nodeId as string,
        property: 'scale',
        from: 1.05,
        to: 1.0,
        duration: 75,
        easing: 'easeInOutCubic',
        target,
      })
    },
  })
}

function fireAction(
  nodeId: AnyNodeId,
  binding: HAEntityBinding,
  trigger: 'tap' | 'longPress',
) {
  if (!shouldFire(nodeId as string, binding, trigger)) return

  const action = trigger === 'tap' ? binding.tapAction : binding.longPressAction
  if (!action) return

  const handler = HANDLERS[action.kind]
  if (!handler) return // already logged at registration

  triggerVisualFeedback(nodeId)
  handler(binding, action) // fire-and-forget, errors caught inside handler
}

export function HAInteractionSystem() {
  useEffect(() => {
    const actionRegistry = new Map<AnyNodeId, RegisteredAction[]>()
    const pressState = new Map<number, PressEntry>() // pointerId → entry

    function registerAction(nodeId: AnyNodeId, binding: HAEntityBinding) {
      const rec: RegisteredAction = {
        binding,
        validTap: validateAction(
          nodeId as string, binding, 'tap', binding.tapAction,
        ),
        validLongPress: validateAction(
          nodeId as string, binding, 'longPress', binding.longPressAction,
        ),
      }
      if (!rec.validTap && !rec.validLongPress) return
      const list = actionRegistry.get(nodeId) ?? []
      list.push(rec)
      actionRegistry.set(nodeId, list)
    }

    function unregisterAction(nodeId: AnyNodeId, binding: HAEntityBinding) {
      const list = actionRegistry.get(nodeId)
      if (!list) return
      const idx = list.findIndex((r) => r.binding.entityId === binding.entityId)
      if (idx >= 0) list.splice(idx, 1)
      if (list.length === 0) actionRegistry.delete(nodeId)
    }

    // Initial snapshot
    let prevMappings: MappingMap = collectHAMappings(useScene.getState().nodes)
    for (const [nodeId, bindings] of prevMappings) {
      for (const b of bindings) registerAction(nodeId, b)
    }

    const unsubScene = useScene.subscribe((state) => {
      const nextMappings = collectHAMappings(state.nodes)
      reconcileMappings(prevMappings, nextMappings, {
        onAdd: registerAction,
        onRemove: unregisterAction,
        onChange: (id, b) => {
          unregisterAction(id, b)
          registerAction(id, b)
        },
      })
      prevMappings = nextMappings
    })

    // --- Bus mitt subscribes ---

    const onPointerDown = (e: ItemEvent) => {
      const pid = e.nativeEvent.nativeEvent.pointerId
      const nodeId = e.node.id
      const records = actionRegistry.get(nodeId)
      if (!records) return
      const timer = setTimeout(() => {
        for (const rec of records) {
          if (rec.validLongPress && rec.binding.longPressAction) {
            fireAction(nodeId, rec.binding, 'longPress')
          }
        }
        pressState.delete(pid)
      }, LONG_PRESS_MS)
      pressState.set(pid, {
        nodeId,
        startX: e.nativeEvent.nativeEvent.clientX,
        startY: e.nativeEvent.nativeEvent.clientY,
        timer,
      })
    }

    const onPointerMove = (e: ItemEvent) => {
      const pid = e.nativeEvent.nativeEvent.pointerId
      const ps = pressState.get(pid)
      if (!ps) return
      const dx = e.nativeEvent.nativeEvent.clientX - ps.startX
      const dy = e.nativeEvent.nativeEvent.clientY - ps.startY
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
        clearTimeout(ps.timer)
        pressState.delete(pid)
      }
    }

    const onPointerUp = (e: ItemEvent) => {
      const pid = e.nativeEvent.nativeEvent.pointerId
      const ps = pressState.get(pid)
      if (ps) {
        clearTimeout(ps.timer)
        pressState.delete(pid)
      }
    }

    const onLeave = (e: ItemEvent) => {
      const pid = e.nativeEvent.nativeEvent.pointerId
      const ps = pressState.get(pid)
      if (ps) {
        clearTimeout(ps.timer)
        pressState.delete(pid)
      }
    }

    const onClick = (e: ItemEvent) => {
      const records = actionRegistry.get(e.node.id)
      if (!records) return
      for (const rec of records) {
        if (rec.validTap && rec.binding.tapAction) {
          fireAction(e.node.id, rec.binding, 'tap')
        }
      }
    }

    emitter.on('item:pointerdown', onPointerDown)
    emitter.on('item:move', onPointerMove)
    emitter.on('item:pointerup', onPointerUp)
    emitter.on('item:leave', onLeave)
    emitter.on('item:click', onClick)

    return () => {
      emitter.off('item:pointerdown', onPointerDown)
      emitter.off('item:move', onPointerMove)
      emitter.off('item:pointerup', onPointerUp)
      emitter.off('item:leave', onLeave)
      emitter.off('item:click', onClick)
      unsubScene()
      for (const { timer } of pressState.values()) clearTimeout(timer)
      pressState.clear()
      actionRegistry.clear()
    }
  }, [])

  return null
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/editor && bunx tsc --noEmit --project tsconfig.json 2>&1 | grep "HAInteractionSystem" || echo "OK"
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/editor/ha/systems/HAInteractionSystem.tsx
git commit -m "feat(ha): HAInteractionSystem — tap/long-press → HA actions

Subscribes to Pascal mitt bus (item:click, item:pointerdown, :pointerup,
:move, :leave). Registration phase pre-validates tap/longPress actions
(single log per bad binding, not per tap). Long-press synthesized via
pointerdown + 500ms timer, cancelled on move > 8px or pointerup. Multi-
touch safe via Map<pointerId, PressEntry>. Tap feedback: scale pulse 1.0
→1.05→1.0 in 150ms via shared animationManager, decoupled from HA state
confirmation."
```

---

## Task 10 : `index.ts` + intégration dans `EditorWithHA.tsx`

**Objectif :** Export public propre, et brancher les deux systems dans
`EditorWithHA`.

**Files:**
- Create: `apps/editor/ha/systems/index.ts`
- Modify: `apps/editor/ha/EditorWithHA.tsx`

- [ ] **Step 1: Créer `systems/index.ts`**

```ts
// apps/editor/ha/systems/index.ts
export { HAVisualSystem } from './HAVisualSystem'
export { HAInteractionSystem } from './HAInteractionSystem'
```

- [ ] **Step 2: Modifier `EditorWithHA.tsx`**

```tsx
// apps/editor/ha/EditorWithHA.tsx
'use client'

import { Editor } from '@pascal-app/editor'
import type { ComponentProps } from 'react'
import { HABootstrap } from './HABootstrap'
import { HAMappingPanel } from './components/HAMappingPanel'
import { SceneIORegistration } from '../scene-io/SceneIORegistration'
import { HAVisualSystem, HAInteractionSystem } from './systems'

/**
 * Pascal's Editor wrapped with our HA bootstrap + overlay panels + runtime
 * systems. All HA wiring stays isolated from Pascal surfaces.
 */
export function EditorWithHA(props: ComponentProps<typeof Editor>) {
  return (
    <>
      <HABootstrap />
      <HAVisualSystem />
      <HAInteractionSystem />
      <SceneIORegistration />
      <Editor {...props} />
      <HAMappingPanel />
    </>
  )
}
```

- [ ] **Step 3: Lancer `bun dev` et vérifier absence de crash**

```bash
bun dev
```
Attendu : serveur démarre, `http://localhost:3002` charge l'éditeur Pascal
sans erreur en console. `/ha-test` reste fonctionnel.

- [ ] **Step 4: Commit**

```bash
git add apps/editor/ha/systems/index.ts apps/editor/ha/EditorWithHA.tsx
git commit -m "feat(ha): wire HAVisualSystem + HAInteractionSystem into EditorWithHA

Siblings of HABootstrap/HAMappingPanel. Zero modif to Pascal's Editor or
page.tsx beyond the D-009 Editor→EditorWithHA swap."
```

---

## Task 11 : Validation manuelle end-to-end contre HA live

**Objectif :** Valider que toute la chaîne fonctionne avec une vraie
instance HA. Suit le §8 du spec.

**Files:** aucun code, scénarios de test manuel.

- [ ] **Step 1: Préparer une lampe mappée**

1. `bun dev`, ouvrir `http://localhost:3002`
2. Importer une scène ou créer un item (n'importe quelle forme avec un mesh)
3. Dans le panel HA Mapping, lier l'item à `light.salon` (ou toute lampe
   HA disponible) avec visual `emissive` par défaut et tapAction `toggle`.

- [ ] **Step 2: Scénario A — état initial**

État HA : lampe ON.
Attendu : à l'ouverture de la scène, l'item glow immédiatement (emissive
appliquée via `fireImmediately`).

- [ ] **Step 3: Scénario B — toggle depuis l'app HA mobile**

1. Depuis l'app HA mobile / companion, éteindre `light.salon`
2. Observer dans l'éditeur : emissive disparaît en < 1s

Répéter en allumant.

- [ ] **Step 4: Scénario C — tap dans l'éditeur**

1. Tap simple sur l'item
2. Attendu : pulse scale instantané + HA reçoit le toggle (visible dans
   l'app HA) + emissive change au retour
3. Tap rapide 5× de suite : debounce absorbe les 4 taps suivants (1 seul
   toggle observé côté HA)

- [ ] **Step 5: Scénario D — typo nodeId**

Créer un binding manuellement (via DevTools ou via `setHAMapping`) sur un
nodeId qui n'existe pas.

Attendu : à 30s, `console.error` clair. Les autres bindings continuent de
fonctionner.

- [ ] **Step 6: Scénario E — unavailable**

Éteindre la box HA (ou déconnecter le token le temps du test).
Attendu : `console.warn` une fois, tous les items mappés passent en
off-visual (emissive noir / intensité 0).

- [ ] **Step 7: Scénario F — popup rejeté**

Dans le panel HA, tenter d'assigner `tapAction.kind: 'popup'` sur un
binding.
Attendu : au mount du system (rechargement), `console.error` explicite. Tap
sur cet item = feedback scale mais aucun appel HA.

- [ ] **Step 8: Scénario G — long-press + pan caméra**

1. Maintenir le clic sur un item 500ms sans bouger → longPressAction fire
2. Maintenir le clic + pan caméra (drag > 8px) → longPressAction NE fire
   PAS, tap standard fire au relâchement

- [ ] **Step 9: Pas de commit ici, c'est de la validation**

Si un scénario échoue, créer une issue précise et ne pas passer à Task 12
tant que c'est corrigé.

---

## Task 12 : CHANGELOG + DECISIONS + CLAUDE.md

**Objectif :** Documenter la phase 5 + 6 dans les docs projet.

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md` (ligne "Statut actuel")
- Modify: `DECISIONS.md` (D-010 si nouveau, sinon skip)

- [ ] **Step 1: Ajouter entrée CHANGELOG**

Insérer en haut de la section `## [Unreleased]` :

```markdown
### 2026-04-XX — feat

- PHASE 5 : `HAVisualSystem` — état HA live → `mesh.material.emissive` en
  temps réel. Subscribe Zustand par binding (pas de RAF continu),
  coalescing `invalidate()` via `queueMicrotask`, pending queue + polling
  500ms + abandon 30s pour rattraper le cas GLB pas chargé au mount,
  `reconcileMappings` pour réagir aux édits du panel.
  - `apps/editor/ha/systems/animation-manager.ts` : singleton RAF on/off
    avec cancel+replace
  - `apps/editor/ha/systems/mapping-registry.ts` : collect + reconcile
    partagés
  - `apps/editor/ha/systems/target-resolver.ts` : regex
    `/glow|emissive|_emit$/i` + fallback Group, clone matériau mesh-level
  - `apps/editor/ha/systems/emissive-visual.ts` : pre-parse Color + apply
  - `apps/editor/ha/systems/HAVisualSystem.tsx` : assemblage
- PHASE 6 : `HAInteractionSystem` — tap/long-press → actions HA.
  `toggle` (whitelist domain), `call_service` (paramétré). Long-press
  synthétisé 500ms avec cancel sur `move > 8px`, multi-touch safe via
  `pointerId`. Feedback scale 1.0→1.05→1.0 en 150ms découplé de la
  confirmation HA. Debounce 300ms par (nodeId, entityId, trigger).
  - `apps/editor/ha/systems/action-handlers.ts` : dispatcher + validate +
    debounce
  - `apps/editor/ha/systems/HAInteractionSystem.tsx` : assemblage
- `packages/ha-bridge/src/store.ts` : ajout du middleware
  `subscribeWithSelector` pour permettre `haStore.subscribe(selector, ...)`
  avec `fireImmediately`. Rétro-compatible.
```

- [ ] **Step 2: Mettre à jour `CLAUDE.md` section "Statut actuel"**

Remplacer les lignes sur PHASE 5/6 par :

```markdown
## Statut actuel (2026-04-XX)

- PHASE 0 / 1 / 3 / 4 / 5 / 6 : DONE
  - PHASE 5 : `HAVisualSystem` — emissive temps réel, Zustand subscribe,
    sans RAF continu
  - PHASE 6 : `HAInteractionSystem` — tap/long-press → toggle /
    call_service, multi-touch safe
- PHASE 9 (partielle) : import JSON ajouté, `feat/scene-io` pushée
- Prochaines étapes :
  - PHASE 5.1 : cover visual (volets animés) + brightness attribute
  - PHASE 7 : popup actions + catalogue GLB
  - PHASE 2 (catalogue GLB custom) reste reportée
```

- [ ] **Step 3: Vérifier qu'aucune nouvelle D-XXX n'est nécessaire**

Confirmation : zéro modification de fichier Pascal, zéro nouvelle
dépendance sur un schéma Pascal. D-007, D-008, D-009 couvrent déjà tout
ce qui a été ajouté (le package `@maison-3d/ha-bridge` + swap
`Editor → EditorWithHA`). **Pas de D-010 pour PHASE 5/6.**

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "docs: PHASE 5 + 6 — HAVisualSystem + HAInteractionSystem done

Met à jour CHANGELOG + statut projet. Aucune nouvelle D-XXX : les
extensions restent dans apps/editor/ha/systems/, zéro modif Pascal
supplémentaire au-delà de D-009 (swap Editor→EditorWithHA)."
```

---

## Self-Review Checklist

Vérification finale avant handoff :

**Coverage du spec :**
- §4.1 vue d'ensemble → Task 8 ✓
- §4.2 structures → Task 8 (inline) ✓
- §4.3 cycle de vie + reconcile → Task 4 + Task 8 ✓
- §4.4 registerBinding + warn kind non-emissive → Task 8 ✓
- §4.5 applyVisual + table états → Task 6 + Task 8 ✓
- §4.6 resolveTargets regex + clone → Task 5 ✓
- §4.7 drainPending + abandon 30s → Task 8 ✓
- §4.8 scheduleInvalidate coalescing → Task 8 (inline) ✓
- §5.1 registration symétrique → Task 9 ✓
- §5.2 HANDLERS + null popup/navigate → Task 7 ✓
- §5.3 handleToggle → Task 7 ✓
- §5.4 handleCallService → Task 7 ✓
- §5.5 debounce shouldFire → Task 7 ✓
- §5.6 long-press multi-touch safe → Task 9 ✓
- §5.7 feedback scale → Task 9 ✓
- §6 animation manager avec cancel+replace → Task 3 ✓
- §7 modifs externes → Task 2 (store) + Task 10 (EditorWithHA) ✓
- §8 testing manuel → Task 11 ✓
- Gate smoke test clone → Task 1 ✓

**Type consistency :**
- `RegisteredBinding.parsed: ParsedEmissive` (§8 Task) ↔ `parseEmissive()`
  retour (§6 Task) ✓
- `animationManager.push({ target: { set(v) } })` (§3 Task) ↔ utilisation
  dans `triggerVisualFeedback` (§9 Task) ✓
- `validateAction(nodeId, binding, trigger, action)` signature (§7 Task) ↔
  utilisation dans `registerAction` (§9 Task) ✓
- `shouldFire` retour bool (§7 Task) ↔ utilisation dans `fireAction` (§9
  Task) ✓
- `reconcileMappings(prev, next, cb)` (§4 Task) ↔ appels (§8 + §9 Tasks) ✓

**Placeholder scan :**
- Aucun TBD / TODO dans les tasks (le TODO PHASE 5.1 dans Task 8 est un
  commentaire dans le code référé au spec)
- Toutes les imports référencent des symboles définis ✓
- Tous les chemins sont absolus sur Windows ou relatifs au repo root ✓

**Ordre des tâches :**
1. Gate smoke test (Task 1) — avant tout
2. Infra ha-bridge (Task 2)
3. Modules purs testables (Task 3, 4)
4. Modules utilitaires (Task 5, 6, 7)
5. Composants React (Task 8, 9)
6. Intégration (Task 10)
7. Validation end-to-end (Task 11)
8. Docs (Task 12)

Dépendances : 8 dépend de 3+4+5+6, 9 dépend de 3+4+7, 10 dépend de 8+9,
11 dépend de 10. Respecté.
