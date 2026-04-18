'use client'

import { create } from 'zustand'

/**
 * Kiosk camera store — a tiny "reset requested" signal.
 *
 * Design choice: Pascal's `<Viewer>` does NOT mount camera controls of its own
 * (that's `CustomCameraControls` in the editor package). The kiosk mounts
 * `<OrbitControls>` as a child of `<Viewer>` and reads `resetTick` from here to
 * imperatively recenter the camera + controls target.
 *
 * We could have pushed this into `@pascal-app/viewer`'s `useViewer` store, but:
 *   - that store is persisted with partialize() — a tick would flood localStorage
 *   - it would couple kiosk to an editor-owned package
 *   - the event bus (`camera-controls:*`) is editor-scoped: nothing in the
 *     viewer package listens for it
 * A kiosk-local store keeps the contract explicit and matches the existing
 * kiosk state pattern (kiosk-store, config-store).
 */
type CameraStore = {
  resetTick: number
  requestReset: () => void
}

export const useCameraStore = create<CameraStore>((set, get) => ({
  resetTick: 0,
  requestReset: () => set({ resetTick: get().resetTick + 1 }),
}))
