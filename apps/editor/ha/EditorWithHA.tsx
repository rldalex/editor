'use client'

import { Editor } from '@pascal-app/editor'
import type { ComponentProps } from 'react'
import { HABootstrap } from './HABootstrap'
import { HAMappingPanel } from './components/HAMappingPanel'

/**
 * Pascal's Editor wrapped with our HA bootstrap + overlay panels. This lives
 * in apps/editor/ha/ so that app/page.tsx only has to swap `Editor` for
 * `EditorWithHA` — all HA wiring stays isolated from Pascal surfaces.
 */
export function EditorWithHA(props: ComponentProps<typeof Editor>) {
  return (
    <>
      <HABootstrap />
      <Editor {...props} />
      <HAMappingPanel />
    </>
  )
}
