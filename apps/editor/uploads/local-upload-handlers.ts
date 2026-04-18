import { GuideNode, ScanNode, useScene, type AnyNodeId } from '@pascal-app/core'
import { useUploadStore } from '@pascal-app/editor'

const blobUrls = new Set<string>()

export function localUploadAsset(
  _projectId: string,
  levelId: string,
  file: File,
  type: 'scan' | 'guide',
) {
  const store = useUploadStore.getState()
  store.startUpload(levelId, type, file.name)

  try {
    const url = URL.createObjectURL(file)
    blobUrls.add(url)

    const node =
      type === 'scan'
        ? ScanNode.parse({ url, parentId: levelId })
        : GuideNode.parse({ url, parentId: levelId })

    useScene.getState().createNode(node, levelId as AnyNodeId)
    store.setResult(levelId, url)
    store.clearUpload(levelId)
  } catch (err) {
    store.setError(levelId, err instanceof Error ? err.message : 'Upload failed')
  }
}

export function localDeleteAsset(_projectId: string, url: string) {
  if (blobUrls.has(url)) {
    URL.revokeObjectURL(url)
    blobUrls.delete(url)
  }
}
