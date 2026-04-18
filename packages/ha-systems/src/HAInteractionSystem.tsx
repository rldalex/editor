'use client'

import { useEffect } from 'react'
import { invalidate } from '@react-three/fiber'
import { emitter, sceneRegistry, useScene } from '@pascal-app/core'
import type { AnyNodeId, ItemEvent } from '@pascal-app/core'
import type { HAEntityBinding } from './schema'
import { collectHAMappings, reconcileMappings, type MappingMap } from './mapping-registry'
import {
  dispatchAction,
  HANDLERS,
  shouldFire,
  validateAction,
  type DispatchScope,
} from './action-handlers'
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
  scope: DispatchScope,
) {
  if (!shouldFire(nodeId as string, binding, trigger)) return

  const action = trigger === 'tap' ? binding.tapAction : binding.longPressAction
  if (!action) return

  const handler = HANDLERS[action.kind]
  if (!handler) return // already logged at registration

  triggerVisualFeedback(nodeId)
  // fire-and-forget via dispatchAction, which honors `scope` (kiosk no-ops
  // popup actions with warn-once). Errors inside handlers are caught internally.
  dispatchAction(action, binding, { scope })
}

interface HAInteractionSystemProps {
  /**
   * Dispatch scope. In `'kiosk'` mode, popup actions are no-op'd (with a
   * one-time warn per entity) because the kiosk has no popup UI. Defaults
   * to `'editor'`.
   */
  scope?: DispatchScope
}

export function HAInteractionSystem({
  scope = 'editor',
}: HAInteractionSystemProps = {}) {
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
            fireAction(nodeId, rec.binding, 'longPress', scope)
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
      let fired = false
      for (const rec of records) {
        if (rec.validTap && rec.binding.tapAction) {
          fireAction(e.node.id, rec.binding, 'tap', scope)
          fired = true
        }
      }
      // If we handled the tap, swallow the event so Pascal's selection
      // manager doesn't re-target the camera or jolt the view. Items
      // mapped to HA are meant to behave as buttons in preview/kiosk
      // mode; to edit their mapping, open them via the Scene sidebar.
      if (fired) e.stopPropagation()
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
  }, [scope])

  return null
}
