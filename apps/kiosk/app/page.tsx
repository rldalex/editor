'use client'

import { HAConfigStep } from '../components/wizard/HAConfigStep'
import { useKioskStore } from '../state/kiosk-store'

export default function KioskRoot() {
  const step = useKioskStore((s) => s.step)

  if (step === 'ha-config') return <HAConfigStep />
  if (step === 'scene-load') return <div>Étape scène (C3 à venir)</div>
  return <div>Ready — viewer à monter (C4 à venir)</div>
}
