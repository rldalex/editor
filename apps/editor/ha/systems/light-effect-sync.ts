// apps/editor/ha/systems/light-effect-sync.ts
import { useInteractive, useScene } from '@pascal-app/core'
import type { AnyNodeId, ItemNode } from '@pascal-app/core'
import type { HAState } from '@maison-3d/ha-bridge'
import { useItemLightPool } from '@pascal-app/viewer'

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
    // Force the store to emit a change so any derived subscribers refresh.
    // ItemLightSystem reads via getState() so it doesn't strictly need
    // this, but consistency-wise we don't want the Map reference to feel
    // stale to other potential consumers.
    useItemLightPool.setState({ registrations: new Map(pool.registrations) })
  }
}
