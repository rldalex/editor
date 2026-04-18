// apps/editor/ha/systems/emissive-visual.ts
import { Color } from 'three'
import type { Mesh } from 'three'
import { uniform } from 'three/tsl'
import type { HAEmissiveVisual, HAEntityBinding } from '../schema'

/**
 * Uniform nodes are TSL (Three.js Shading Language) wrappers that bind
 * directly into a NodeMaterial's compiled shader. Mutating their `.value`
 * is picked up automatically by WebGPU's uniform buffer on the next frame
 * — no needsUpdate, no recompile. This is the correct way to drive runtime
 * values into a NodeMaterial.
 *
 * TSL uniform nodes are typed as `ShaderNodeObject<UniformNode<T>>` in
 * three/tsl but that type isn't re-exported at a stable path. Typing as
 * `any` for the node handle is acceptable — we only touch `.value` and
 * `.mul()` on it, both verified at runtime.
 */
type UniformNodeLike = { value: any; mul: (other: any) => any }

export type ParsedEmissive = {
  colorUniform: UniformNodeLike
  intensityUniform: UniformNodeLike
  onColor: Color
  offColor: Color
  intensityOn: number
  intensityOff: number
}

export function parseEmissive(visual: HAEmissiveVisual): ParsedEmissive {
  const onColor = new Color(visual.onColor ?? '#ffaa00')
  const offColor = new Color(visual.offColor ?? '#000000')
  const intensityOn = visual.intensityOn ?? 1.5
  const intensityOff = visual.intensityOff ?? 0
  return {
    // Seed uniforms at the off-state so the first apply (fireImmediately)
    // can match either on/off without an awkward initial black flash.
    colorUniform: uniform(offColor.clone()),
    intensityUniform: uniform(intensityOff),
    onColor,
    offColor,
    intensityOn,
    intensityOff,
  }
}

// Warn each entity at most once per "off-like" state to avoid log spam
const warnedUnavailable = new Set<string>()

// Tracks which materials already have their emissiveNode wired to our
// uniforms. Avoids recompiling the shader on every apply — we only pay the
// recompile cost once per mesh, on the first apply.
const ATTACHED_FLAG = Symbol('haEmissiveAttached')

/**
 * Maps an HA state string to the visual pair (color, intensity) and applies
 * it to all target meshes. Treats unavailable/unknown/undefined as off (v1
 * kiosk policy, see spec §4.5).
 *
 * The first apply per mesh attaches an emissiveNode = colorUniform *
 * intensityUniform to the material (one-time shader recompile). All
 * subsequent applies just mutate `.value` on the uniforms — zero recompile,
 * WebGPU picks up the change on the next frame automatically.
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
      for (const m of mat) attachEmissiveNode(m, parsed, mesh.name)
    } else {
      attachEmissiveNode(mat, parsed, mesh.name)
    }
  }

  // Mutate the shared uniforms. WebGPU picks this up on the next frame
  // without needsUpdate — this is the whole point of going through TSL.
  parsed.colorUniform.value.copy(color)
  parsed.intensityUniform.value = intensity
}

function attachEmissiveNode(
  mat: any,
  parsed: ParsedEmissive,
  meshName: string,
): void {
  if (!mat) return
  if (mat[ATTACHED_FLAG]) return

  // MeshStandardNodeMaterial and related expose `emissiveNode`. Plain
  // MeshBasicMaterial does not — guard and warn.
  if (!('emissiveNode' in mat)) {
    console.warn(
      `HAVisualSystem: mesh "${meshName}" material ${mat.type ?? '?'} has no emissiveNode, skipping`,
    )
    mat[ATTACHED_FLAG] = true // don't retry next tick
    return
  }

  // Build the emissive node graph: colorUniform * intensityUniform.
  // The multiplication returns a new node whose value is recomputed per
  // frame from the current uniform values.
  mat.emissiveNode = parsed.colorUniform.mul(parsed.intensityUniform)
  mat.needsUpdate = true // one-time recompile to integrate the new node
  mat[ATTACHED_FLAG] = true
  console.log(
    `[HAVisualSystem] attached emissiveNode to mesh "${meshName || '(unnamed)'}"`,
  )
}
