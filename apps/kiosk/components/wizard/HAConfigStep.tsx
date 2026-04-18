'use client'

import { connectHA, disconnectHA, useHAConnection } from '@maison-3d/ha-bridge'
import { useState } from 'react'
import { useConfigStore } from '../../state/config-store'
import { useKioskStore } from '../../state/kiosk-store'
import styles from './HAConfigStep.module.css'

export function HAConfigStep() {
  const setStep = useKioskStore((s) => s.setStep)
  const setHAConfig = useConfigStore((s) => s.setHAConfig)
  const haUrl = useConfigStore((s) => s.haUrl)
  const haToken = useConfigStore((s) => s.haToken)
  const [url, setUrl] = useState(haUrl ?? '')
  const [token, setToken] = useState(haToken ?? '')
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { status } = useHAConnection()

  const onTest = async () => {
    setTesting(true)
    setError(null)
    try {
      disconnectHA()
      await connectHA({ url, token })
      setHAConfig(url, token)
      setStep('scene-load')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Configuration Home Assistant</h1>
      <label className={styles.label}>
        URL
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://homeassistant.local:8123"
          className={styles.input}
        />
      </label>
      <label className={styles.label}>
        Long-lived token
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className={styles.input}
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <button
        type="button"
        className={styles.button}
        onClick={onTest}
        disabled={testing || !url || !token}
      >
        {testing ? 'Connexion…' : 'Tester et continuer'}
      </button>
      <p className={styles.status}>Statut : {status}</p>
    </div>
  )
}
