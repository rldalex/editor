'use client'

import { HAInteractionSystem, HAVisualSystem } from '@maison-3d/ha-systems'
import { Viewer } from '@pascal-app/viewer'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import { useCameraStore } from '../../state/camera-store'
import styles from './KioskViewer.module.css'

/**
 * KioskViewer — R3F Canvas read-only.
 *
 * Uses Pascal's high-level `<Viewer>` component directly. That component already
 * mounts:
 *   - `<Canvas>` (WebGPU renderer + shadows + tone mapping)
 *   - `<ViewerCamera>` (perspective/ortho based on `useViewer.cameraMode`)
 *   - `<Lights>` + `<PostProcessing>`
 *   - All core systems (Ceiling/Door/Fence/Item/Roof/Slab/Stair/Wall/Window/Zone)
 *   - Level / Guide / Scan / WallCutout / ItemLight helpers
 *
 * The scene graph is read from `@pascal-app/core`'s `useScene` store, which was
 * populated by `loadBundleIntoKiosk` in the previous wizard step.
 *
 * We pass `selectionManager="custom"` so the editor-oriented default
 * SelectionManager (which drives building/level/zone drill-down) is NOT mounted
 * — kiosk mode has no selection UI.
 *
 * HA systems are mounted as children of `<Viewer>` so they live inside the R3F
 * tree (required: `HAVisualSystem` uses `useFrame` to drive emissive/cover
 * visuals). `HAInteractionSystem` runs with `scope="kiosk"` so popup actions
 * (PHASE 7, deferred) no-op with a one-time warn instead of crashing.
 *
 * Camera controls: Pascal's `<Viewer>` does NOT mount any controls (that lives
 * in the editor's `CustomCameraControls`). The kiosk mounts its own
 * `<OrbitControls>` so the user can orbit/pan/zoom the house. `<CameraResetSync>`
 * watches `useCameraStore.resetTick` and calls `controls.reset()` imperatively,
 * driven by the floating reset button overlay.
 */

type OrbitControlsRef = React.ComponentRef<typeof OrbitControls>

function CameraResetSync({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsRef | null> }) {
  const resetTick = useCameraStore((s) => s.resetTick)

  // Save the initial camera/target state once on mount so `reset()` has a baseline.
  // OrbitControls stores position0/target0/zoom0 at construction time, but in
  // strict mode or with `makeDefault` there can be a race where the snapshot
  // happens before the perspective camera's `position={[10,10,10]}` is applied.
  // Re-saving after the first frame guarantees a correct baseline.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    // Wait a tick so the camera's initial position is definitely applied.
    const raf = requestAnimationFrame(() => {
      controls.saveState()
    })
    return () => cancelAnimationFrame(raf)
  }, [controlsRef])

  useEffect(() => {
    if (resetTick === 0) return // Skip the initial render tick
    controlsRef.current?.reset()
  }, [resetTick, controlsRef])

  return null
}

export function KioskViewer() {
  const controlsRef = useRef<OrbitControlsRef | null>(null)

  return (
    <div className={styles.canvas}>
      <Viewer selectionManager="custom">
        <HAVisualSystem />
        <HAInteractionSystem scope="kiosk" />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={5}
          maxDistance={80}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
        <CameraResetSync controlsRef={controlsRef} />
      </Viewer>
    </div>
  )
}
