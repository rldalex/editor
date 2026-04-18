'use client'

import { useRef } from 'react'
import { useKioskStore } from '../../state/kiosk-store'
import styles from './overlays.module.css'

export function ConfigButton() {
  const setStep = useKioskStore((s) => s.setStep)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onDown = () => {
    timer.current = setTimeout(() => setStep('ha-config'), 800)
  }

  const onUp = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  return (
    <button
      type="button"
      className={styles.configButton}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      aria-label="Config (long press)"
    >
      ⚙
    </button>
  )
}
