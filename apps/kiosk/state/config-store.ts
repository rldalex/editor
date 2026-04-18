'use client'

import type { SceneBundleManifest } from '@maison-3d/scene-bundle'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ConfigStore = {
  haUrl: string | null
  haToken: string | null
  bundleMeta: SceneBundleManifest | null
  houseName: string | null
  setHAConfig: (url: string, token: string) => void
  clearHAConfig: () => void
  setBundleMeta: (meta: SceneBundleManifest) => void
  setHouseName: (name: string | null) => void
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      haUrl: null,
      haToken: null,
      bundleMeta: null,
      houseName: null,
      setHAConfig: (haUrl, haToken) => set({ haUrl, haToken }),
      clearHAConfig: () => set({ haUrl: null, haToken: null }),
      setBundleMeta: (bundleMeta) =>
        set({ bundleMeta, houseName: bundleMeta.scene.houseName ?? null }),
      setHouseName: (houseName) => set({ houseName }),
    }),
    { name: 'maison3d-kiosk:config' },
  ),
)
