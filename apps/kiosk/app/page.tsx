'use client'

import { Clock } from '../components/overlays/Clock'
import { ConfigButton } from '../components/overlays/ConfigButton'
import { HAStatusBadge } from '../components/overlays/HAStatusBadge'
import { HouseName } from '../components/overlays/HouseName'
import { ResetCameraButton } from '../components/overlays/ResetCameraButton'
import { KioskViewer } from '../components/viewer/KioskViewer'
import { HAConfigStep } from '../components/wizard/HAConfigStep'
import { SceneLoadStep } from '../components/wizard/SceneLoadStep'
import { useKioskStore } from '../state/kiosk-store'

export default function KioskRoot() {
  const step = useKioskStore((s) => s.step)

  if (step === 'ha-config') return <HAConfigStep />
  if (step === 'scene-load') return <SceneLoadStep />
  return (
    <>
      <KioskViewer />
      <Clock />
      <HouseName />
      <HAStatusBadge />
      <ResetCameraButton />
      <ConfigButton />
    </>
  )
}
