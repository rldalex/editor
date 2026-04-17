'use client'

import { useCommandRegistry } from '@pascal-app/editor'
import { useEffect } from 'react'
import { openImportDialog } from './import'

/**
 * Inline FileUp SVG (matches lucide-react's `FileUp` used by Pascal's Export
 * command). Kept inline to avoid adding lucide-react as a direct dep of
 * apps/editor — see D-008 for the same rationale on zod.
 */
function FileUpIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M12 12v6" />
      <path d="m9 15 3-3 3 3" />
    </svg>
  )
}

/**
 * Registers scene-io commands in Pascal's command palette (Ctrl/Cmd+K).
 *
 * Pascal already ships "Export Scene (JSON)" (FileJson icon) — this adds the
 * missing "Import Scene (JSON)" counterpart with a FileUp icon for visual
 * parity in the palette. Pascal's export serializes `node.metadata`, so our
 * `metadata.ha` mappings round-trip for free.
 */
export function SceneIORegistration(): null {
  const register = useCommandRegistry((s) => s.register)

  useEffect(() => {
    return register([
      {
        id: 'editor.import.json',
        label: 'Import Scene (JSON)',
        group: 'Export & Share',
        icon: <FileUpIcon className="h-4 w-4" />,
        keywords: ['import', 'load', 'json', 'upload', 'open'],
        execute: () => {
          openImportDialog()
        },
      },
    ])
  }, [register])

  return null
}
