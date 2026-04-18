'use client'

import { HAInteractionSystem, HAVisualSystem } from '@maison-3d/ha-systems'
import { Viewer } from '@pascal-app/viewer'
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
 */
export function KioskViewer() {
  return (
    <div className={styles.canvas}>
      <Viewer selectionManager="custom">
        <HAVisualSystem />
        <HAInteractionSystem scope="kiosk" />
      </Viewer>
    </div>
  )
}
