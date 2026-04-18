'use client'

import { useCameraStore } from '../../state/camera-store'
import styles from './ResetCameraButton.module.css'

/**
 * Floating bottom-right button that asks the `<CameraResetSync>` observer
 * inside `<KioskViewer>` to recenter the camera to its initial position.
 *
 * Since Pascal's `<Viewer>` mounts no controls of its own, all interaction is
 * driven by the `<OrbitControls>` we add inside `<KioskViewer>`. Incrementing
 * `resetTick` triggers a `controls.reset()` call — idempotent, safe to spam.
 */
export function ResetCameraButton() {
  const requestReset = useCameraStore((s) => s.requestReset)

  return (
    <button
      type="button"
      className={styles.button}
      onClick={requestReset}
      aria-label="Recadrer la vue"
    >
      ⟲
    </button>
  )
}
