'use client'

import { connectHA } from '@maison-3d/ha-bridge'
import { useEffect, useRef } from 'react'
import { useConfigStore } from '../state/config-store'
import { useKioskStore } from '../state/kiosk-store'

/**
 * Auto-resume gate : au premier mount, si on a deja `haUrl + haToken` dans
 * localStorage (persistes via Zustand persist middleware) ainsi qu'un
 * `bundleMeta` (scene deja chargee dans IndexedDB via `loadBundleIntoKiosk`),
 * on saute le wizard et on passe directement a `ready`.
 *
 * La scene est deja persistee dans IDB (useScene persist middleware), donc
 * il suffit de reconnecter HA avec les credentials stockes.
 */
export function BootstrapGate() {
  const ran = useRef(false)

  useEffect(() => {
    // Guard contre le double-invoke de StrictMode en dev.
    if (ran.current) return
    ran.current = true

    // Zustand persist avec storage: localStorage rehydrate de maniere
    // synchrone. Pour etre extra-safe face a une future migration vers un
    // storage async, on verifie `hasHydrated()` et on diferre si besoin.
    const run = () => {
      const { haUrl, haToken, bundleMeta } = useConfigStore.getState()
      if (!haUrl || !haToken) {
        // Pas de creds : on laisse le wizard au defaut 'ha-config'.
        return
      }

      connectHA({ url: haUrl, token: haToken }).catch((err) => {
        console.warn(
          '[kiosk] auto-reconnect failed, falling back to ha-config',
          err,
        )
      })

      if (bundleMeta) {
        useKioskStore.getState().setStep('ready')
      } else {
        useKioskStore.getState().setStep('scene-load')
      }
    }

    if (useConfigStore.persist.hasHydrated()) {
      run()
    } else {
      const unsub = useConfigStore.persist.onFinishHydration(() => {
        run()
        unsub()
      })
    }
  }, [])

  return null
}
