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

// Seed value used to ensure MeshStandardNodeMaterial compiles its emissive
// branch on the first render. We apply a near-zero seed at attach time so
// the shader includes the emissive uniforms — subsequent mutations of
// `emissive.copy()` + `emissiveIntensity` then hit a pipeline that actually
// reads them.
const SEED_INTENSITY = 0.0001
const ATTACHED_FLAG = Symbol('haEmissiveSeeded')

/**
 * Maps an HA state string to the visual pair (color, intensity) and applies
 * it to all target meshes. Treats unavailable/unknown/undefined as off (v1
 * kiosk policy, see spec §4.5).
 *
 * First apply per mesh "seeds" the material with a non-zero emissive so the
 * MeshStandardNodeMaterial (WebGPU/TSL) compiles its shader WITH the
 * emissive branch. Without this seed, if initial emissive is black the TSL
 * code generator omits the emissive pipeline entirely and later uniform
 * mutations have no effect.
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
    warnedUnavailable.delete(`${binding.entityId}::unavailable`)
    warnedUnavailable.delete(`${binding.entityId}::unknown`)
  }

  const color = isOn ? parsed.onColor : parsed.offColor
  const intensity = isOn ? parsed.intensityOn : parsed.intensityOff

  console.log(
    `[HAVisualSystem] apply ${binding.entityId} state=${haState} → intensity=${intensity} color=#${color.getHex().toString(16).padStart(6, '0')} on ${targets.length} mesh(es): ${targets.map((m) => m.name || '(unnamed)').join(', ')} matTypes=[${targets.map((m) => (Array.isArray(m.material) ? 'array' : (m.material as any)?.type ?? '?')).join(', ')}]`,
  )

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
  if (!mat) return
  if (!('emissive' in mat)) {
    console.warn(
      `HAVisualSystem: mesh "${meshName}" material ${mat.type ?? '?'} has no emissive, skipping`,
    )
    return
  }

  // First apply per material: seed with a non-zero emissive BEFORE the
  // shader compiles so the emissive pipeline is included. We set emissive
  // to the target color immediately (not a synthetic seed) and flag the
  // material — this avoids any visible "flash" frame.
  if (!mat[ATTACHED_FLAG]) {
    mat.emissive.copy(color)
    mat.emissiveIntensity = Math.max(intensity, SEED_INTENSITY)
    mat.needsUpdate = true
    mat[ATTACHED_FLAG] = true
    console.log(
      `[HAVisualSystem] seeded + attached emissive on mesh "${meshName || '(unnamed)'}" (first apply)`,
    )
    return
  }

  // Subsequent applies: hot path. The shader already reads emissive uniforms.
  mat.emissive.copy(color)
  mat.emissiveIntensity = intensity
}
