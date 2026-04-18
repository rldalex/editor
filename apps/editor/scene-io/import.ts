'use client'

import { applySceneGraphToEditor, type SceneGraph } from '@pascal-app/editor'
import { useScene } from '@pascal-app/core'

/**
 * Shape of the JSON produced by Pascal's "Export Scene (JSON)" command.
 * We accept any extra keys for forward compatibility.
 */
type ExportedScene = {
  nodes?: SceneGraph['nodes']
  rootNodeIds?: SceneGraph['rootNodeIds']
}

function isExportedScene(value: unknown): value is ExportedScene {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.nodes !== undefined &&
    typeof v.nodes === 'object' &&
    Array.isArray(v.rootNodeIds)
  )
}

/**
 * Parse a JSON file exported by Pascal and load it into the editor. Throws
 * if the file is malformed. Replaces the current scene entirely — caller
 * is responsible for confirming with the user.
 */
export async function importSceneFromFile(file: File): Promise<{
  nodeCount: number
  rootCount: number
}> {
  const text = await file.text()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`Fichier JSON invalide : ${(err as Error).message}`)
  }

  if (!isExportedScene(parsed)) {
    throw new Error(
      "Format de scène non reconnu : le fichier doit contenir { nodes, rootNodeIds }.",
    )
  }

  const sceneGraph: SceneGraph = {
    nodes: parsed.nodes as SceneGraph['nodes'],
    rootNodeIds: parsed.rootNodeIds as SceneGraph['rootNodeIds'],
  }

  applySceneGraphToEditor(sceneGraph)

  return {
    nodeCount: Object.keys(sceneGraph.nodes ?? {}).length,
    rootCount: sceneGraph.rootNodeIds?.length ?? 0,
  }
}

/**
 * Open a native file picker, read the selected JSON and apply it to the
 * scene. Shows a confirm() if the current scene is non-empty. Catches
 * parse errors and surfaces them via alert().
 */
export function openImportDialog(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    const currentCount = Object.keys(useScene.getState().nodes).length
    if (currentCount > 0) {
      const ok = window.confirm(
        `La scène actuelle contient ${currentCount} nœud(s). Importer va tout remplacer. Continuer ?`,
      )
      if (!ok) return
    }

    try {
      const { nodeCount, rootCount } = await importSceneFromFile(file)
      console.info(
        `[scene-io] scène importée : ${nodeCount} nœud(s), ${rootCount} racine(s)`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`Import échoué : ${message}`)
    }
  }
  input.click()
}
