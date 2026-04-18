'use client'

import { useRef, useState } from 'react'
import { loadBundleIntoKiosk } from '../../bundle/load-bundle'
import { useConfigStore } from '../../state/config-store'
import { useKioskStore } from '../../state/kiosk-store'
import styles from './SceneLoadStep.module.css'

export function SceneLoadStep() {
  const setStep = useKioskStore((s) => s.setStep)
  const setBundleMeta = useConfigStore((s) => s.setBundleMeta)
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ name: string; size: number } | null>(
    null,
  )

  const onPick = () => inputRef.current?.click()
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const res = await loadBundleIntoKiosk(file)
      setBundleMeta(res.manifest)
      setPreview({ name: res.houseName ?? 'Maison', size: res.nodeCount })
      if (res.missingAssets.length > 0) {
        console.warn('[kiosk] missing assets:', res.missingAssets)
      }
      setStep('ready')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Charger la scène</h1>
      <p className={styles.help}>
        Sélectionnez un fichier <code>.maison3d.zip</code>
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.maison3d.zip,application/zip"
        onChange={onFile}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        className={styles.button}
        onClick={onPick}
        disabled={loading}
      >
        {loading ? 'Chargement…' : 'Choisir un fichier'}
      </button>
      {error && <p className={styles.error}>{error}</p>}
      {preview && (
        <p className={styles.preview}>
          {preview.name} — {preview.size} nœud(s)
        </p>
      )}
      <button
        type="button"
        className={styles.backButton}
        onClick={() => setStep('ha-config')}
      >
        ← Retour HA config
      </button>
    </div>
  )
}
