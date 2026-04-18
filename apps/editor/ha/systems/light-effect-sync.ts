// apps/editor/ha/systems/light-effect-sync.ts
import { sceneRegistry, useInteractive, useScene } from '@pascal-app/core'
import type { AnyNodeId, ItemNode } from '@pascal-app/core'
import type { HAState } from '@maison-3d/ha-bridge'
import { useItemLightPool } from '@pascal-app/viewer'
import { Vector3, type PointLight } from 'three'

/**
 * Locate the index of the first `toggle` control on an item's asset
 * interactive definition, or -1 if the asset has no such control or no
 * LightEffect to drive. Cached per-node to avoid re-scanning each frame.
 *
 * We only return a valid index when BOTH conditions hold:
 *   - `asset.interactive.controls` contains a `kind: 'toggle'` entry
 *   - `asset.interactive.effects` contains at least one `kind: 'light'`
 * That way, mapping an item without a real Three.js light effect (e.g. a
 * decorative figurine) is a silent no-op — we won't flip a toggle that
 * does nothing visible, and we won't log spurious warnings.
 */
export function findToggleControlIndex(nodeId: AnyNodeId): number {
  const node = useScene.getState().nodes[nodeId] as ItemNode | undefined
  if (!node || node.type !== 'item') return -1
  const interactive = node.asset?.interactive
  if (!interactive) return -1

  const hasLightEffect = interactive.effects?.some((e) => e.kind === 'light')
  if (!hasLightEffect) return -1

  const idx = interactive.controls?.findIndex((c) => c.kind === 'toggle') ?? -1
  return idx
}

/**
 * Sync an HA entity state to the item's Pascal interactive toggle. When
 * the mapped entity is `on`, Pascal's ItemLightPool spins up the light
 * effect defined on the asset (the real Three.js PointLight that
 * illuminates the room). Idempotent: re-calling with the same state is
 * cheap — Zustand's setState is a no-op when the value doesn't change.
 *
 * Called every frame by HAVisualSystem's reapply loop alongside the
 * emissive mutation, so state survives Pascal re-renders the same way.
 */
export function syncLightEffect(
  nodeId: AnyNodeId,
  toggleIndex: number,
  haState: string | undefined,
): void {
  if (toggleIndex < 0) return
  const isOn = haState === 'on'
  const current = useInteractive.getState().items[nodeId]?.controlValues?.[toggleIndex]
  if (current === isOn) return // avoid triggering renderers on no-op sets
  useInteractive.getState().setControlValue(nodeId, toggleIndex, isOn)
}

/** Convert HA's rgb_color tuple [0-255, 0-255, 0-255] to a CSS hex string. */
function rgbToHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/**
 * Sync the Pascal `LightEffect.color` to the HA entity's `rgb_color`
 * attribute so the Three.js PointLight emits photons matching the real
 * bulb's colour. No-op when the asset has no LightEffect registered or
 * when the entity doesn't expose `rgb_color` (e.g. colour-temp-only
 * whites).
 *
 * Mutates `registration.effect` to a new object (no in-place mutation —
 * the asset's `interactive.effects[]` is a shared reference and must not
 * be touched). Pascal's ItemLightSystem reads `reg.effect.color` on its
 * next pool re-assignment pass (every 200ms, or on camera movement), so
 * there's a small latency before the scene updates. Acceptable for
 * lighting changes, which aren't typically split-second-sensitive.
 */
export function syncLightColor(nodeId: AnyNodeId, haStateEntry: HAState | undefined): void {
  if (!haStateEntry || haStateEntry.state !== 'on') return
  const rgb = haStateEntry.attributes?.rgb_color as [number, number, number] | undefined
  if (!Array.isArray(rgb) || rgb.length !== 3) return
  const hex = rgbToHex(rgb)

  const pool = useItemLightPool.getState()
  let mutated = false
  for (const [key, reg] of pool.registrations) {
    if (reg.nodeId !== nodeId) continue
    if (reg.effect.color === hex) continue
    // Replace the effect object with a colour-overridden clone. Do NOT
    // mutate reg.effect in place — the original is a reference to the
    // shared asset definition.
    pool.registrations.set(key, {
      ...reg,
      effect: { ...reg.effect, color: hex },
    })
    mutated = true
  }
  if (mutated) {
    useItemLightPool.setState({ registrations: new Map(pool.registrations) })
  }

  // Pascal's ItemLightSystem only calls `light.color.set(reg.effect.color)`
  // when a pool slot is assigned to a *new* key (pass 2). When the same
  // key stays on the same slot (pass 1 "keep existing"), the colour is
  // never re-read. So mutating reg.effect.color alone doesn't visibly
  // update a light that's currently shining on our item. Second leg:
  // walk the scene for PointLights whose world position is near our
  // item's light offset and mutate their .color directly.
  mutatePointLightColor(nodeId, hex)
}

// Reused scratch Vector3 to avoid allocation in the RAF hot path.
const _scratchVec = new Vector3()

/**
 * Find any active Three.js PointLight whose world position matches the
 * mapped item's light offset (within a few units) and mutate its colour.
 * Pool size is 12, traversal cost is trivial.
 */
function mutatePointLightColor(nodeId: AnyNodeId, hex: string): void {
  const group = sceneRegistry.nodes.get(nodeId as string)
  if (!group) return

  // Walk up to the scene root — first ancestor with no parent.
  let root: typeof group | null = group
  while (root && root.parent) root = root.parent
  if (!root) return

  group.getWorldPosition(_scratchVec)
  const itemX = _scratchVec.x
  const itemY = _scratchVec.y
  const itemZ = _scratchVec.z
  // Allow for typical asset offsets (mostly vertical, up to ~2m).
  // Items are typically spaced > 4m apart in a floor plan, so a 3-unit
  // match radius reliably picks the right PointLight without cross-contam.
  const THRESHOLD_SQ = 3 * 3

  root.traverse((obj) => {
    const light = obj as PointLight
    if (!light.isPointLight) return
    // Skip idle pool slots (intensity = 0 means "not assigned")
    if (light.intensity < 0.01) return
    const dx = light.position.x - itemX
    const dy = light.position.y - itemY
    const dz = light.position.z - itemZ
    const distSq = dx * dx + dy * dy + dz * dz
    if (distSq > THRESHOLD_SQ) return
    light.color.set(hex)
  })
}
