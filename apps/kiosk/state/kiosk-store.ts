'use client'

import { create } from 'zustand'

export type WizardStep = 'ha-config' | 'scene-load' | 'ready'

type KioskStore = {
  step: WizardStep
  setStep: (step: WizardStep) => void
}

export const useKioskStore = create<KioskStore>((set) => ({
  step: 'ha-config',
  setStep: (step) => set({ step }),
}))
