'use client'

import { useCommandRegistry } from '@pascal-app/editor'
import { useEffect } from 'react'
import { openImportDialog } from './import'

/**
 * Registers scene-io commands in Pascal's command palette (Ctrl/Cmd+K).
 *
 * Pascal already ships "Export Scene (JSON)" — this component adds the
 * missing "Import Scene (JSON)" counterpart so a house can be saved to a
 * file and loaded back later. Pascal's export serializes `node.metadata`
 * too, so our `metadata.ha` mappings round-trip for free.
 */
export function SceneIORegistration(): null {
  const register = useCommandRegistry((s) => s.register)

  useEffect(() => {
    return register([
      {
        id: 'editor.import.json',
        label: 'Import Scene (JSON)',
        group: 'Export & Share',
        keywords: ['import', 'load', 'json', 'upload', 'open'],
        execute: () => {
          openImportDialog()
        },
      },
    ])
  }, [register])

  return null
}
