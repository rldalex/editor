'use client'

import { useEffect, useState } from 'react'
import styles from './overlays.module.css'

export function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')

  return (
    <div className={styles.clock}>
      {hh}:{mm}
    </div>
  )
}
