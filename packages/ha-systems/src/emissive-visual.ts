import { Color } from 'three'
import type { Mesh } from 'three'
import type { HAEmissiveVisual, HAEntityBinding } from './schema'

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

// Flag per material: set once after we've bumped its version to force the
// NodeMaterial's shader to recompile with the emissive branch active. Next
// frames just mutate uniforms.
const COMPILED_FLAG = Symbol('haEmissiveCompiled')

/**
 * Maps an HA state string to the visual pair (color, intensity) and applies
 * it to all target meshes. Treats unavailable/unknown/undefined as off (v1
 * kiosk policy, see spec §4.5).
 *
 * Called every frame by the RAF loop in HAVisualSystem to compensate for
 * Pascal's <Clone> swapping materials back. The hot path is a Color.copy +
 * number assign per mesh — the version bump to recompile the NodeMaterial
 * shader happens once per (fresh) material via the COMPILED_FLAG.
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
  _meshName: string,
): void {
  if (!mat) return
  if (!('emissive' in mat)) return // silently skip; material type unsupported

  mat.emissive.copy(color)
  mat.emissiveIntensity = intensity

  // NodeMaterial (WebGPU/TSL) compiles its shader from a node graph. When
  // `emissive` is (0,0,0) at compile time, the TSL code generator optimises
  // the emissive branch out entirely. Bumping `material.version` forces
  // three.js to re-evaluate the graph on the next frame, reintegrating the
  // emissive branch that reads our updated uniforms. Done once per material
  // (first time we see it with our flag absent).
  if (!mat[COMPILED_FLAG]) {
    mat.version = (mat.version ?? 0) + 1
    mat.needsUpdate = true
    mat[COMPILED_FLAG] = true
  }
}
