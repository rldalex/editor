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
