'use client'

import { useCommandRegistry } from '@pascal-app/editor'
import { useEffect } from 'react'
import { downloadBundle, exportSceneBundle } from './bundle-export'
import { openBundleImportDialog } from './bundle-import'
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
 * Inline Package SVG (matches lucide-react's `Package`). Used for the
 * .maison3d.zip bundle commands — evokes the zip-as-self-contained-box
 * metaphor. Inline for the same dep-minimisation reason as FileUp.
 */
function PackageIcon({ className }: { className?: string }) {
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
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}

// App version reported in the bundle manifest's `createdBy.version`.
// Kept as a constant here (rather than reading package.json) to avoid
// bundling build-time metadata into the runtime. Update on feature bumps.
const APP_VERSION = '0.1.0'

/**
 * Registers scene-io commands in Pascal's command palette (Ctrl/Cmd+K).
 *
 * Pascal already ships "Export Scene (JSON)" (FileJson icon). We add:
 *  - "Import Scene (JSON)"  (FileUp icon) — counterpart to Pascal's export.
 *  - "Export Scene Bundle (.maison3d.zip)" (Package icon) — produces the
 *    self-contained archive consumed by the kiosk app.
 *  - "Import Scene Bundle (.maison3d.zip)" (Package icon) — round-trip.
 *
 * Pascal's export serializes `node.metadata`, so our `metadata.ha`
 * mappings round-trip for free in both JSON and bundle formats.
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
      {
        id: 'editor.export.bundle',
        label: 'Export Scene Bundle (.maison3d.zip)',
        group: 'Export & Share',
        icon: <PackageIcon className="h-4 w-4" />,
        keywords: [
          'export',
          'bundle',
          'zip',
          'maison3d',
          'kiosk',
          'download',
          'archive',
        ],
        execute: async () => {
          try {
            const blob = await exportSceneBundle('', APP_VERSION)
            downloadBundle(blob)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            window.alert(`Export du bundle échoué : ${message}`)
          }
        },
      },
      {
        id: 'editor.import.bundle',
        label: 'Import Scene Bundle (.maison3d.zip)',
        group: 'Export & Share',
        icon: <PackageIcon className="h-4 w-4" />,
        keywords: [
          'import',
          'bundle',
          'zip',
          'maison3d',
          'kiosk',
          'load',
          'open',
          'archive',
        ],
        execute: () => {
          openBundleImportDialog()
        },
      },
    ])
  }, [register])

  return null
}
