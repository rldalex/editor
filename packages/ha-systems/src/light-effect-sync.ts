// apps/editor/ha/systems/light-effect-sync.ts
import { sceneRegistry, useInteractive, useScene } from '@pascal-app/core'
import type { AnyNodeId, ItemNode } from '@pascal-app/core'
import type { HAState } from '@maison-3d/ha-bridge'
import { useItemLightPool } from '@pascal-app/viewer'
import { Vector3, type PointLight } from 'three'

export type LightControls = {
  /** Index of the `kind:'toggle'` control, or -1. */
  toggleIndex: number
  /** Index of the first `kind:'slider'` control, or -1 if none. */
  sliderIndex: number
  /** Slider bounds (only meaningful when sliderIndex >= 0). */
  sliderMin: number
  sliderMax: number
}

const NO_LIGHT_CONTROLS: LightControls = {
  toggleIndex: -1,
  sliderIndex: -1,
  sliderMin: 0,
  sliderMax: 1,
}

/**
 * Locate the indices of the `toggle` and (optional) `slider` controls on
 * an item's asset interactive definition. Returns indices -1 when the
 * asset doesn't declare a `kind:'light'` effect — mapping a decorative
 * figurine won't flip a toggle that does nothing visible, and won't log
 * spurious warnings.
 *
 * Cached per-binding at registration so the per-frame reapply loop
 * doesn't re-scan the asset.
 */
export function findLightControls(nodeId: AnyNodeId): LightControls {
  const node = useScene.getState().nodes[nodeId] as ItemNode | undefined
  if (!node || node.type !== 'item') return NO_LIGHT_CONTROLS
  const interactive = node.asset?.interactive
  if (!interactive) return NO_LIGHT_CONTROLS

  const hasLightEffect = interactive.effects?.some((e) => e.kind === 'light')
  if (!hasLightEffect) return NO_LIGHT_CONTROLS

  const toggleIndex = interactive.controls?.findIndex((c) => c.kind === 'toggle') ?? -1
  const sliderIdx = interactive.controls?.findIndex((c) => c.kind === 'slider') ?? -1
  const sliderControl =
    sliderIdx >= 0 && interactive.controls
      ? (interactive.controls[sliderIdx] as { kind: 'slider'; min: number; max: number })
      : null
  return {
    toggleIndex,
    sliderIndex: sliderIdx,
    sliderMin: sliderControl?.min ?? 0,
    sliderMax: sliderControl?.max ?? 1,
  }
}

/** @deprecated use findLightControls — kept as a shim for call sites we haven't rewritten yet */
export function findToggleControlIndex(nodeId: AnyNodeId): number {
  return findLightControls(nodeId).toggleIndex
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

/**
 * Sync HA's `brightness` attribute (0-255) to Pascal's slider control on
 * the item's asset. Normalises into the slider's declared range (typically
 * 0-100 for a percentage dial). Pascal's `ItemLightSystem` reads this
 * slider value each frame (see `item-light-system.tsx:269-277`) so the
 * PointLight intensity follows the slider — and therefore follows HA's
 * brightness — without any extra plumbing.
 *
 * No-op when:
 *   - the asset has no slider control (sliderIndex < 0)
 *   - the entity is off (brightness is undefined / 0 when off, but we don't
 *     want to zero the slider and lose the user's last intensity pref;
 *     Pascal uses `intensityRange[0]` automatically when toggle is false)
 *   - the attribute is absent (non-dimmable switch entity)
 */
export function syncLightBrightness(
  nodeId: AnyNodeId,
  sliderIndex: number,
  sliderMin: number,
  sliderMax: number,
  haStateEntry: HAState | undefined,
): void {
  if (sliderIndex < 0) return
  if (!haStateEntry || haStateEntry.state !== 'on') return
  const brightness = haStateEntry.attributes?.brightness
  if (typeof brightness !== 'number') return
  // HA brightness is 0-255; map linearly into Pascal's slider range.
  const normalized = Math.round(sliderMin + (brightness / 255) * (sliderMax - sliderMin))
  const current = useInteractive.getState().items[nodeId]?.controlValues?.[sliderIndex]
  if (current === normalized) return
  useInteractive.getState().setControlValue(nodeId, sliderIndex, normalized)
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
