# Design — HAVisualSystem + HAInteractionSystem (PHASE 5 & 6)

Date : 2026-04-18
Statut : draft en attente de review utilisateur

Objet : deux systems React/R3F côtés `apps/editor/ha/systems/` qui connectent
l'état Home Assistant au rendu 3D Pascal et permettent aux interactions 3D de
déclencher des actions HA. Zéro modification de `packages/core` et
`packages/viewer`.

---

## 1. Objectifs et non-objectifs

### Objectifs v1

- **PHASE 5 — visuel temps réel** : pour chaque `ItemNode` avec un mapping HA
  `emissive`, la couleur et l'intensité émissive du mesh reflètent l'état HA
  (`on` / `off`). Mise à jour sans RAF continu.
- **PHASE 6 — interactions** : tap sur un mesh mappé `toggle` ou `call_service`
  déclenche l'action correspondante via `@maison-3d/ha-bridge`. Feedback
  visuel instantané au tap indépendant de la confirmation d'état HA.
- **Long-press** : construit à partir de `item:pointerdown` + timer + cancel
  sur mouvement caméra > 8px.

### Non-objectifs v1 (backlog documenté)

- `cover`, `label`, `color` visuels → PHASE 5.1+
- `popup` / `navigate` actions → PHASE 7
- Brightness / attributes HA (au-delà de `state`) → PHASE 5.1
- Dispose matériaux au unregister → backlog P2
- Visuel dédié `unavailable` (gris terne) → backlog P2
- Optimistic UI pré-confirmation HA → PHASE 7 si latence constatée gênante
- Restore matériaux originaux au unregister → backlog P2

---

## 2. Contraintes découvertes à respecter

Les découvertes suivantes ont forgé le design et ne doivent pas être oubliées
lors de l'implémentation.

1. **Matériaux globaux partagés.** Pascal écrase les matériaux des GLB par
   deux singletons `baseMaterial` / `glassMaterial`
   (`packages/core/src/materials.ts:6-24` +
   `packages/viewer/src/components/renderers/item/item-renderer.tsx:117-152`).
   Muter `baseMaterial.emissive` illumine TOUS les items. Obligatoire de
   cloner le matériau au niveau mesh avant toute mutation.
2. **`sceneRegistry` sans subscribe.** Objet plain avec `Map` + `Set`, aucun
   event (`packages/core/src/hooks/scene-registry/scene-registry.ts`). On
   observe `useScene` à la place (Zustand subscribable vanilla).
3. **`useScene` sans `subscribeWithSelector`.** Middleware `temporal` de
   zundo, pas de selector natif. Subscribe vanilla + `pending.size === 0`
   guard.
4. **`haStore` sans `subscribeWithSelector`.** À ajouter (modif interne au
   package `@maison-3d/ha-bridge`, rétro-compatible).
5. **Pas d'`item:long-press` natif.** Bus Pascal expose `item:pointerdown` /
   `item:pointerup` / `item:move` (`packages/core/src/events/bus.ts:61-70`).
   À synthétiser.
6. **Pas de cleanup auto des matériaux.** Pascal ne dispose pas les matériaux
   au teardown. Notre fuite = équivalente à l'existant Pascal (les matériaux
   clonés de `<Clone>` drei fuitent aussi). Accepté en v1.
7. **Frameloop Pascal = `"always"` par défaut** (vérifié dans
   `packages/viewer/src/components/viewer/index.tsx:105-164`, pas de prop
   `frameloop=`). Mais on utilise `invalidate()` de `@react-three/fiber` pour
   rester compatible `"demand"` si un jour le kiosque passe en mode éco.

---

## 3. Architecture

```
apps/editor/ha/systems/
├── HAVisualSystem.tsx          # PHASE 5 — monté dans EditorWithHA, pas de rendu
├── HAInteractionSystem.tsx     # PHASE 6 — monté dans EditorWithHA, pas de rendu
├── animation-manager.ts        # partagé, RAF on/off, cancel+replace
├── emissive-visual.ts          # helpers mutation material.emissive
├── action-handlers.ts          # dispatcher toggle / call_service
├── target-resolver.ts          # regex /glow|emissive|_emit$/i + fallback Group
└── index.ts
```

Modifs externes :
- `packages/ha-bridge/src/store.ts` : ajouter `subscribeWithSelector`.
- `apps/editor/ha/EditorWithHA.tsx` : monter `<HAVisualSystem />` et
  `<HAInteractionSystem />` en siblings de `HABootstrap`.

Aucune D-XXX supplémentaire.

---

## 4. HAVisualSystem — design détaillé

### 4.1 Vue d'ensemble

`HAVisualSystem` est un composant React sans rendu, monté hors `<Canvas>`. À
l'init il parcourt `useScene.getState().nodes`, isole les `ItemNode` avec un
mapping `emissive` via `getHAMapping`, et pour chaque binding :

1. Résout les meshes cibles dans le Group (regex sur nom + fallback Group
   entier).
2. Clone le matériau au niveau mesh pour isoler des singletons Pascal.
3. Pre-parse `onColor` / `offColor` en `THREE.Color`.
4. Souscrit à l'état HA pour le `entityId` avec `fireImmediately: true`.

Quand l'état HA change, le system mute directement
`mesh.material.emissive` + `emissiveIntensity` puis appelle
`scheduleInvalidate()`.

### 4.2 Structures de données

```ts
type RegisteredBinding = {
  bindingKey: string            // `${nodeId}::${visual.kind}`, last-wins
  nodeId: AnyNodeId
  binding: HAEntityBinding
  targets: Mesh[] | null        // null = GLB pas chargé
  onColorParsed: THREE.Color
  offColorParsed: THREE.Color
  intensityOn: number
  intensityOff: number
  unsubHA: () => void
}

const registered = new Map<string, RegisteredBinding>()   // bindingKey → reg
const pending    = new Set<string>()                       // bindingKeys à retry
```

### 4.3 Cycle de vie — mount

```ts
useEffect(() => {
  // 1. Pour chaque ItemNode avec mapping emissive, registerBinding(...)
  // 2. Subscribe scene store (Pascal) pour les ajouts/retraits futurs
  const unsubScene = useScene.subscribe(drainPending)
  // 3. Polling safety 500ms — cas B de la race mount (non-déterministe)
  const timer = setInterval(drainPending, 500)
  // 4. Cas A explicite : drain une fois après tout le setup, idempotent
  drainPending()
  return () => {
    clearInterval(timer)
    unsubScene()
    for (const reg of registered.values()) reg.unsubHA()
    registered.clear()
    pending.clear()
  }
}, [])
```

### 4.4 `registerBinding(nodeId, binding)`

```ts
function registerBinding(nodeId, binding) {
  if (binding.visual?.kind !== 'emissive') return   // v1 emissive-only

  const key = `${nodeId}::${binding.visual.kind}`

  // Last-wins : remplace propre si déjà enregistré
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
    targets: null,
    onColorParsed:  new THREE.Color(binding.visual.onColor  ?? '#ffaa00'),
    offColorParsed: new THREE.Color(binding.visual.offColor ?? '#000000'),
    intensityOn:  binding.visual.intensityOn  ?? 1.5,
    intensityOff: binding.visual.intensityOff ?? 0,
    unsubHA: () => {},
  }

  // Subscribe HA — N subscribes, fireImmediately
  const selector = (s) => s.states[binding.entityId]?.state
  reg.unsubHA = haStore.subscribe(selector, (next, prev) => {
    if (next === prev) return
    applyVisual(reg, prev, next)
  }, { fireImmediately: true })

  registered.set(key, reg)
  // applyVisual est called immediately via fireImmediately — si meshes pas
  // prêts, il pushera reg.bindingKey dans `pending` lui-même.
}
```

### 4.5 `applyVisual(reg, prev, next)`

```ts
function applyVisual(reg, prev, next) {
  // 1. Résoudre targets si pas déjà fait
  if (reg.targets === null) {
    const targets = resolveTargets(reg.nodeId)  // regex + fallback + clone
    if (targets === null) {
      pending.add(reg.bindingKey)
      return
    }
    reg.targets = targets
  }

  // 2. Mapper l'état HA à la valeur visuelle
  //    Table explicite (v1 kiosque) :
  //    'on'                                  → onColor / intensityOn
  //    'off' | 'unavailable' | 'unknown' | undefined → offColor / intensityOff
  //    unavailable/unknown logs une warning dev (pas prod)
  const isOn = next === 'on'
  if (next === 'unavailable' || next === 'unknown') {
    console.warn(
      `HAVisualSystem: ${reg.binding.entityId} state=${next}, treated as off`
    )
  }
  const targetColor = isOn ? reg.onColorParsed : reg.offColorParsed
  const targetIntensity = isOn ? reg.intensityOn : reg.intensityOff

  // 3. Mutation directe (v1 : instantané, pas d'animation)
  for (const mesh of reg.targets) {
    const mat = mesh.material
    if (!('emissive' in mat)) {
      console.warn(`HAVisualSystem: mesh ${mesh.name} material has no emissive`)
      continue
    }
    mat.emissive.copy(targetColor)
    mat.emissiveIntensity = targetIntensity
  }

  scheduleInvalidate()
}
```

### 4.6 `resolveTargets(nodeId)` — regex + clone

```ts
const EMISSIVE_MESH_REGEX = /glow|emissive|_emit$/i

function resolveTargets(nodeId): Mesh[] | null {
  const group = sceneRegistry.nodes.get(nodeId)
  if (!group) return null

  // Collecte tous les meshes descendants
  const allMeshes: Mesh[] = []
  group.traverse((c) => { if ((c as Mesh).isMesh) allMeshes.push(c as Mesh) })
  if (allMeshes.length === 0) return null

  // Filtre par convention de nommage
  const matched = allMeshes.filter((m) => EMISSIVE_MESH_REGEX.test(m.name))
  const targets = matched.length > 0 ? matched : allMeshes

  // Clone matériau mesh-level pour isoler du singleton Pascal
  for (const mesh of targets) {
    const m = mesh.material
    mesh.material = Array.isArray(m) ? m.map((x) => x.clone()) : m.clone()
  }

  return targets
}
```

**Gate d'impl step 1** : avant de s'engager sur ce pattern, smoke test dans
`/ha-test` :

```ts
const a = baseMaterial.clone()
const b = baseMaterial.clone()
a.emissive.set('#ff0000')
console.log(a.emissive.getHex(), b.emissive.getHex())
// Attendu : 16711680, 0 (ou défaut). Si b === 16711680 → clone partage la
//           ref Color, fallback `mat.emissive = mat.emissive.clone()` requis.
```

### 4.7 `drainPending()`

```ts
function drainPending() {
  if (pending.size === 0) return
  for (const key of [...pending]) {
    const reg = registered.get(key)
    if (!reg) { pending.delete(key); continue }

    const targets = resolveTargets(reg.nodeId)
    if (targets === null) continue       // still not ready

    reg.targets = targets
    // Re-lit l'état HA au drain, PAS un snapshot stocké
    const current = haStore.getState().states[reg.binding.entityId]?.state
    applyVisual(reg, undefined, current)
    pending.delete(key)
  }
}
```

### 4.8 Abandon à 30s

Compteur `firstPending: Map<bindingKey, timestamp>`. Dans `drainPending`, si
`now - firstPending.get(key) > 30000` :

```ts
console.error(
  `HAVisualSystem: binding ${key} never resolved ` +
  `(nodeId=${reg.nodeId}, entity=${reg.binding.entityId}) — check nodeId`
)
reg.unsubHA()
pending.delete(key)
registered.delete(key)
firstPending.delete(key)
```

Timer `setInterval` s'auto-stop quand `pending.size === 0` (guard en début).

### 4.9 `scheduleInvalidate()` — coalescing

```ts
let invalidateScheduled = false
function scheduleInvalidate() {
  if (invalidateScheduled) return
  invalidateScheduled = true
  queueMicrotask(() => {
    invalidateScheduled = false
    invalidate()
  })
}
```

Un tick HA Zustand → N mutations synchrones dans N listeners → 1
`invalidate()` au microtask suivant. Compatible `frameloop="demand"`.

---

## 5. HAInteractionSystem — design détaillé

### 5.1 Vue d'ensemble

Monté hors `<Canvas>`. Au mount, s'abonne au bus mitt Pascal pour
`item:click`, `item:pointerdown`, `item:pointerup`, `item:move`. Pour chaque
event, lookup le mapping HA du node via `getHAMapping`, extrait `tapAction` /
`longPressAction`, dispatch via `HANDLERS`.

### 5.2 Dispatcher

```ts
type ActionHandler = (binding: HAEntityBinding, action: HAAction) => Promise<void>

const HANDLERS: Record<HAAction['kind'], ActionHandler | null> = {
  toggle: handleToggle,
  call_service: handleCallService,
  popup: null,       // PHASE 7+ — rejeté au registration
  navigate: null,    // YAGNI v1 — rejeté au registration
  none: async () => {},
}
```

Au registration d'un binding, si `tapAction.kind` ou `longPressAction.kind`
pointe sur `null` → `console.error` explicite + skip ce trigger (le binding
peut avoir un tap valide et un longPress invalide, seul longPress est
ignoré).

### 5.3 `handleToggle` avec whitelist

```ts
const TOGGLE_DOMAINS = new Set([
  'light', 'switch', 'fan', 'cover',
  'input_boolean', 'automation', 'group',
])

async function handleToggle(binding, action) {
  if (!TOGGLE_DOMAINS.has(binding.domain)) {
    console.error(
      `HAInteractionSystem: toggle not supported for domain '${binding.domain}' ` +
      `on ${binding.entityId}. Use call_service with '${binding.domain}.turn_on' ` +
      `or '${binding.domain}.media_play_pause' instead.`
    )
    return
  }
  try {
    await callService({
      domain: 'homeassistant',
      service: 'toggle',
      target: { entity_id: binding.entityId },
    })
  } catch (err) {
    console.error('HAInteractionSystem: toggle failed', {
      entityId: binding.entityId, error: err,
    })
  }
}
```

Validation au registration, pas au runtime : permet de fail-fast visible dans
la console.

### 5.4 `handleCallService`

```ts
async function handleCallService(binding, action: HACallServiceAction) {
  try {
    await callService({
      domain:  action.domain,
      service: action.service,
      data:    action.data,
      target:  { entity_id: binding.entityId },
    })
  } catch (err) {
    console.error('HAInteractionSystem: call_service failed', {
      entityId: binding.entityId,
      service: `${action.domain}.${action.service}`,
      error: err,
    })
  }
}
```

### 5.5 Debounce 300ms par binding

```ts
const DEBOUNCE_MS = 300
const lastFire = new Map<string, number>()   // `${nodeId}::${entityId}::${trigger}` → ts

function fireAction(
  nodeId: string,
  binding: HAEntityBinding,
  trigger: 'tap' | 'longPress',
  action: HAAction,
) {
  const key = `${nodeId}::${binding.entityId}::${trigger}`
  const now = performance.now()
  const last = lastFire.get(key) ?? 0
  if (now - last < DEBOUNCE_MS) return
  lastFire.set(key, now)

  const handler = HANDLERS[action.kind]
  if (!handler) return  // déjà logé au registration
  triggerVisualFeedback(nodeId)
  handler(binding, action)  // fire & forget, erreurs catchées dans le handler
}
```

La clé debounce inclut `entityId` : si un node a plusieurs bindings (ex. tap
toggle une lampe + tap increment un dimmer sur un autre entityId), chaque
paire (binding, trigger) a sa propre fenêtre de debounce.

### 5.6 Long-press construit

```ts
const LONG_PRESS_MS = 500
const MOVE_THRESHOLD_PX = 8

let pressState: {
  nodeId: string
  startX: number
  startY: number
  timer: ReturnType<typeof setTimeout>
} | null = null

emitter.on('item:pointerdown', (e) => {
  const x = e.nativeEvent.nativeEvent.clientX
  const y = e.nativeEvent.nativeEvent.clientY
  const nodeId = e.node.id
  const mapping = getHAMapping(e.node)
  if (!mapping) return

  pressState = {
    nodeId, startX: x, startY: y,
    timer: setTimeout(() => {
      for (const b of mapping.bindings) {
        if (b.longPressAction) fireAction(nodeId, b, 'longPress', b.longPressAction)
      }
      pressState = null
    }, LONG_PRESS_MS),
  }
})

emitter.on('item:move', (e) => {
  if (!pressState) return
  const dx = e.nativeEvent.nativeEvent.clientX - pressState.startX
  const dy = e.nativeEvent.nativeEvent.clientY - pressState.startY
  if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
    clearTimeout(pressState.timer)
    pressState = null
  }
})

emitter.on('item:pointerup', () => {
  if (pressState) {
    clearTimeout(pressState.timer)
    pressState = null
  }
})

emitter.on('item:click', (e) => {
  // Tap = click, Pascal garantit que click fire seulement si pas pan/long-press
  const mapping = getHAMapping(e.node)
  if (!mapping) return
  for (const b of mapping.bindings) {
    if (b.tapAction) fireAction(e.node.id, b, 'tap', b.tapAction)
  }
})
```

### 5.7 Feedback visuel non-state au tap

```ts
function triggerVisualFeedback(nodeId) {
  const group = sceneRegistry.nodes.get(nodeId)
  if (!group) return
  animationManager.push({
    id: `feedback::${nodeId}::${performance.now()}`,
    nodeId,
    property: 'scale',
    from: 1.0,
    to: 1.05,
    duration: 75,
    easing: 'easeOutCubic',
    onComplete: () => animationManager.push({
      // ... reverse vers 1.0
    }),
  })
}
```

Feedback instantané "tap reçu", découplé de PHASE 5. Animation gérée par
`animationManager` partagé.

---

## 6. Animation manager partagé

`animation-manager.ts` — singleton-like module exporté. RAF démarre à la
première `push()`, s'arrête quand `active.size === 0`.

```ts
type AnimationSpec = {
  id: string
  nodeId: string
  property: 'scale' | 'emissive' | 'emissiveIntensity'
  from: number | THREE.Color
  to:   number | THREE.Color
  duration: number       // ms
  easing: 'linear' | 'easeOutCubic' | 'easeInOutCubic'
  onComplete?: () => void
}

// Cancel+replace sur (nodeId, property) :
push(spec) {
  const existing = findActive(spec.nodeId, spec.property)
  if (existing) {
    spec.from = existing.currentValue   // continue depuis interpolée actuelle
    active.delete(existing)
  }
  active.set(spec.id, { ...spec, startTime: performance.now(), currentValue: spec.from })
  if (raf === null) raf = requestAnimationFrame(tick)
}

function tick(now) {
  for (const anim of active.values()) {
    const t = clamp((now - anim.startTime) / anim.duration, 0, 1)
    const eased = applyEasing(t, anim.easing)
    anim.currentValue = lerp(anim.from, anim.to, eased)
    applyToMesh(anim)   // mute directement
    if (t === 1) {
      active.delete(anim.id)
      anim.onComplete?.()
    }
  }
  scheduleInvalidate()
  raf = active.size > 0 ? requestAnimationFrame(tick) : null
}
```

V1 emissive passe par mutation directe (pas d'animation) pour garder le flux
simple. Feedback au tap passe par `animationManager`. Plus tard
(cover/color/label) utilise `animationManager` pour lerp.

---

## 7. Modifs externes

### 7.1 `packages/ha-bridge/src/store.ts`

```diff
 import { createStore, useStore } from 'zustand'
+import { subscribeWithSelector } from 'zustand/middleware'

-export const haStore = createStore<HABridgeState & HABridgeActions>((set) => ({
+export const haStore = createStore<HABridgeState & HABridgeActions>()(
+  subscribeWithSelector((set) => ({
     ...initialState,
     // ...
-}))
+  }))
+)
```

Rétro-compatible : les `useHAStore(s => s.x)` existants fonctionnent sans
changement.

### 7.2 `apps/editor/ha/EditorWithHA.tsx`

```diff
 export function EditorWithHA(props: ComponentProps<typeof Editor>) {
   return (
     <>
       <HABootstrap />
+      <HAVisualSystem />
+      <HAInteractionSystem />
       <SceneIORegistration />
       <Editor {...props} />
       <HAMappingPanel />
     </>
   )
 }
```

---

## 8. Testing

Pas de tests automatisés en v1 (le monorepo Pascal n'en a pas d'existants sur
les systems R3F). Validation manuelle via `/ha-test` :

1. **Smoke test matériau** (gate d'impl step 1, cf §4.6) — valide clone
   `MeshStandardNodeMaterial`.
2. **Mount avec scène vide** → pas d'erreur console.
3. **Mount avec scène chargée + lampe mappée `light.salon` ON** → à la
   connexion HA, l'émissive s'applique. À `OFF`, elle se retire.
4. **Toggle live HA depuis l'app mobile HA** → l'émissive change en < 1s.
5. **Tap sur la lampe** → flash scale + toggle HA. Deuxième tap dans 200ms
   ignoré (debounce).
6. **Long-press 500ms sans bouger** → action longPress fire. Long-press
   avec pan caméra > 8px → cancel, tap fire ou rien.
7. **Binding sur entityId typo** → après 30s, `console.error` clair, autres
   bindings inchangés.
8. **Binding `kind: 'popup'`** → `console.error` explicite au registration,
   le reste fonctionne.

---

## 9. Risques et mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| `MeshStandardNodeMaterial.clone()` partage la ref Color | moyenne | Gate d'impl step 1, fallback `mat.emissive = mat.emissive.clone()` |
| Race mount (useLayoutEffect vs subscribe) | haute | Polling 500ms + `drainPending()` explicite post-mount |
| Ordre des events `pointerdown` vs `click` Pascal | faible | Debounce 300ms absorbe les doubles-fires |
| Fuite matériaux clonés | certaine mais équivalente à Pascal | Backlog P2, alignement sur cleanup upstream |
| HA WS reconnect → rafale d'events | moyenne | `fireImmediately` + debounce absorbe |
| Kiosque tablette : GPU chauffe | faible | `invalidate()` partout, compatible `frameloop="demand"` |

---

## 10. Extension points documentés

- **PHASE 5.1 cover** : `target-resolver` retourne des meshes, nouveau
  handler `applyCover` qui écrit sur `position.y` ou `rotation.x` via
  `animationManager`. Schema déjà supporte `HACoverVisual`.
- **PHASE 5.1 brightness** : champ optionnel `sourceAttribute?: 'state' |
  'brightness'` dans `HAEmissiveVisual`. Quand `'brightness'`, le system lit
  `state.attributes.brightness` (0-255) et mappe en `[0..intensityOn]`.
  Rétro-compat JSON.
- **PHASE 7 popup** : `HANDLERS['popup']` devient une fonction qui ouvre un
  modal React (brightness slider, climate setpoint). Le binding porte
  `popupType: 'brightness' | 'climate' | ...`.
- **PHASE 7 optimistic UI** : si la latence 100-500ms devient gênante, ajouter
  un cache `expectedState: Map<entityId, { state, expiresAt }>` lu par
  `HAVisualSystem` en priorité pendant 3s après l'action, puis ignoré.

---

## 11. Plan d'implémentation (résumé chronologique)

1. **Smoke test matériau** dans `/ha-test` → confirme isolation `clone()`.
2. **`subscribeWithSelector` sur `haStore`** + tests des hooks existants.
3. **`animation-manager.ts`** (module pur, testable sans R3F).
4. **`target-resolver.ts`** (regex + clone).
5. **`HAVisualSystem.tsx`** squelette mount/unmount + registerBinding +
   subscribe HA.
6. **`applyVisual` + `emissive-visual.ts`** (mutation + scheduleInvalidate).
7. **`drainPending` + polling + abandon 30s.**
8. **`HAInteractionSystem.tsx`** squelette + dispatcher + handlers.
9. **Long-press + debounce + feedback scale.**
10. **Intégration dans `EditorWithHA.tsx`.**
11. **Tests manuels §8** — une lampe mappée live contre
    `homeassistant.lightshift.fr`.
12. **Merge + CHANGELOG + DECISIONS si nouvelle entrée nécessaire.**

---

## 12. Out of scope (recap)

Éléments discutés pendant le brainstorm et volontairement exclus de v1 :

- Restore des matériaux originaux au unregister
- Dispose matériaux au teardown
- Visuel dédié `unavailable`
- Optimistic UI
- Animation emissive (lerp on→off) — v1 instantané
- `popup` / `navigate` handlers
- Brightness / attributes HA
- Tests automatisés
