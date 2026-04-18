// apps/editor/ha/systems/HAVisualSystem.tsx
'use client'

import { useEffect } from 'react'
import type { Mesh } from 'three'
import { invalidate } from '@react-three/fiber'
import { haStore } from '@maison-3d/ha-bridge'
import { sceneRegistry, useScene } from '@pascal-app/core'
import type { AnyNodeId } from '@pascal-app/core'
import type { HAEntityBinding, HAEmissiveVisual } from '../schema'
import { collectHAMappings, reconcileMappings, type MappingMap } from './mapping-registry'
import { ensureCloned, resolveTargets } from './target-resolver'
import { parseEmissive, applyEmissiveState, type ParsedEmissive } from './emissive-visual'
import {
  findLightControls,
  syncLightBrightness,
  syncLightColor,
  syncLightEffect,
  type LightControls,
} from './light-effect-sync'

type RegisteredBinding = {
  bindingKey: string
  nodeId: AnyNodeId
  binding: HAEntityBinding
  parsed: ParsedEmissive
  targets: Mesh[] | null
  /** Last HA state observed for this binding — driven by the subscribe. */
  lastHAState: string | undefined
  /** Indices + bounds of the asset's toggle / slider controls, when the
   *  asset declares a `kind:'light'` effect. Cached at registration so the
   *  per-frame reapply loop doesn't rescan the asset. */
  lightControls: LightControls
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
        lastHAState: undefined,
        lightControls: findLightControls(nodeId),
        unsubHA: () => {},
      }
      registered.set(key, reg)

      const selector = (s: ReturnType<typeof haStore.getState>) =>
        s.states[binding.entityId]?.state
      reg.unsubHA = haStore.subscribe(
        selector,
        (next) => {
          reg.lastHAState = next
          const haEntry = haStore.getState().states[binding.entityId]
          applyVisual(reg, next)
          syncLightEffect(reg.nodeId, reg.lightControls.toggleIndex, next)
          syncLightColor(reg.nodeId, haEntry)
          syncLightBrightness(
            reg.nodeId,
            reg.lightControls.sliderIndex,
            reg.lightControls.sliderMin,
            reg.lightControls.sliderMax,
            haEntry,
          )
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

    // Persistent RAF loop: Pascal's <Clone> from drei re-instanciates mesh
    // materials on its own re-render cadence, silently swapping them back
    // to the shared `baseMaterial` singleton. Each frame we:
    //   1. Drop targets whose Group is no longer in the sceneRegistry.
    //   2. If the Group is fresh, re-resolve targets from scratch.
    //   3. For each target mesh, `ensureCloned` re-clones the material if
    //      Pascal has swapped it back (no-op if our clone is still there).
    //   4. Re-apply the last observed HA state.
    // Writes are cheap (Color.copy + number assign + flag check per mesh).
    let rafId: number | null = null
    function reapplyLoop() {
      for (const reg of registered.values()) {
        const currentGroup = sceneRegistry.nodes.get(reg.nodeId as string)
        if (!currentGroup) {
          reg.targets = null
          continue
        }
        // If we have no targets, or the first target was detached from the
        // current Group (Pascal re-instanciated the whole sub-tree),
        // resolve from scratch.
        const firstTarget = reg.targets?.[0]
        const needsRefresh =
          !reg.targets ||
          reg.targets.length === 0 ||
          !firstTarget ||
          !currentGroup.getObjectById(firstTarget.id)
        if (needsRefresh) {
          const fresh = resolveTargets(reg.nodeId)
          if (fresh === null) continue
          reg.targets = fresh
        } else {
          // Targets still valid, but Pascal may have swapped the material
          // on each mesh back to the singleton. Re-clone where needed.
          for (const mesh of reg.targets!) ensureCloned(mesh)
        }
        applyEmissiveState(reg.binding, reg.parsed, reg.targets!, reg.lastHAState)
        // Pilot Pascal's real Three.js PointLight (from the asset's
        // LightEffect) via the interactive toggle control. Emissive makes
        // the mesh glow; this makes the room actually get lit. Independent
        // so an item can have one without the other (e.g. intensityOn=0
        // for light-only, or an asset without a light effect for glow-only).
        syncLightEffect(reg.nodeId, reg.lightControls.toggleIndex, reg.lastHAState)
        const haEntry = haStore.getState().states[reg.binding.entityId]
        // Also sync the light colour to HA's rgb_color attribute when
        // present, so the Three.js PointLight's photons match the bulb.
        syncLightColor(reg.nodeId, haEntry)
        // And sync dimmer: HA's brightness attribute (0-255) → Pascal
        // slider control → PointLight intensity each frame.
        syncLightBrightness(
          reg.nodeId,
          reg.lightControls.sliderIndex,
          reg.lightControls.sliderMin,
          reg.lightControls.sliderMax,
          haEntry,
        )
      }
      rafId = requestAnimationFrame(reapplyLoop)
    }
    rafId = requestAnimationFrame(reapplyLoop)

    return () => {
      clearInterval(timer)
      unsubScene()
      if (rafId !== null) cancelAnimationFrame(rafId)
      for (const reg of registered.values()) reg.unsubHA()
      registered.clear()
      pending.clear()
    }
  }, [])

  return null
}
