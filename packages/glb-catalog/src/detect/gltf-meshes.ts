/**
 * Parse a GLB blob header to extract node/mesh names without loading meshes
 * into Three.js. Reads the GLTF JSON chunk only.
 *
 * Returns names in scene-tree order (depth-first traversal).
 * Returns [] on parse error or non-GLB blob.
 */
export async function extractMeshNames(blob: Blob): Promise<string[]> {
  try {
    const buf = await blob.arrayBuffer()
    const view = new DataView(buf)

    // GLB magic = 'glTF' = 0x46546c67 (little-endian read)
    if (view.getUint32(0, true) !== 0x46546c67) return []
    if (view.getUint32(4, true) !== 2) return []

    // First chunk after 12-byte header
    const jsonChunkLength = view.getUint32(12, true)
    const jsonChunkType = view.getUint32(16, true)
    if (jsonChunkType !== 0x4e4f534a) return [] // 'JSON'

    const jsonBytes = new Uint8Array(buf, 20, jsonChunkLength)
    const jsonStr = new TextDecoder().decode(jsonBytes)
    const gltf = JSON.parse(jsonStr) as {
      nodes?: Array<{ name?: string; mesh?: number }>
      meshes?: Array<{ name?: string }>
    }

    const names: string[] = []
    for (const node of gltf.nodes ?? []) {
      if (node.name && typeof node.mesh === 'number') names.push(node.name)
    }
    for (const mesh of gltf.meshes ?? []) {
      if (mesh.name) names.push(mesh.name)
    }
    // De-dup while preserving order
    return [...new Set(names)]
  } catch {
    return []
  }
}
