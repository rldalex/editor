'use client'

import { Editor } from '@pascal-app/editor'
import type { ComponentProps } from 'react'
import { HABootstrap } from './HABootstrap'
import { HAMappingPanel } from './components/HAMappingPanel'
import { SceneIORegistration } from '../scene-io/SceneIORegistration'
import { HAVisualSystem, HAInteractionSystem } from './systems'

/**
 * Pascal's Editor wrapped with our HA bootstrap + overlay panels + runtime
 * systems. All HA wiring stays isolated from Pascal surfaces.
 */
export function EditorWithHA(props: ComponentProps<typeof Editor>) {
  return (
    <>
      <HABootstrap />
      <HAVisualSystem />
      <HAInteractionSystem />
      <SceneIORegistration />
      <Editor {...props} />
      <HAMappingPanel />
    </>
  )
}
