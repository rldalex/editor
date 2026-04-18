'use client'

import { useHAConnection } from '@maison-3d/ha-bridge'
import styles from './overlays.module.css'

export function HAStatusBadge() {
  const { status } = useHAConnection()

  const label =
    status === 'connected'
      ? 'Connecté'
      : status === 'connecting'
        ? 'Reconnexion…'
        : status === 'error'
          ? 'Erreur'
          : 'Déconnecté'

  const cls =
    status === 'connected'
      ? styles.dotOk
      : status === 'connecting'
        ? styles.dotWarn
        : styles.dotErr

  return (
    <div className={styles.haStatus}>
      <span className={cls} /> {label}
    </div>
  )
}
