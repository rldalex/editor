'use client'

import { useConfigStore } from '../../state/config-store'
import styles from './overlays.module.css'

export function HouseName() {
  const name = useConfigStore((s) => s.houseName) ?? 'Maison'
  return <div className={styles.houseName}>{name}</div>
}
