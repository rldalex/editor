'use client'

import { connectHA, disconnectHA } from '@maison-3d/ha-bridge'
import { useEffect } from 'react'

const HA_URL = process.env.NEXT_PUBLIC_HA_URL ?? ''
const HA_TOKEN = process.env.NEXT_PUBLIC_HA_TOKEN ?? ''

export const HABootstrap = (): null => {
  useEffect(() => {
    if (!HA_URL || !HA_TOKEN) {
      console.warn(
        '[ha-bridge] NEXT_PUBLIC_HA_URL or NEXT_PUBLIC_HA_TOKEN missing — skipping connect',
      )
      return
    }

    let cancelled = false
    connectHA({ url: HA_URL, token: HA_TOKEN }).catch((err) => {
      if (!cancelled) {
        console.error('[ha-bridge] connect failed', err)
      }
    })

    return () => {
      cancelled = true
      disconnectHA()
    }
  }, [])

  return null
}
