'use client'

import { type CatalogItem, useCatalog } from '@maison-3d/glb-catalog'
import { useEditor } from '@pascal-app/editor'
import { useState } from 'react'
import { CatalogTile } from './CatalogTile'
import { EditItemModal } from './EditItemModal'
import { UploadZone } from './UploadZone'
import { toAssetInput } from './to-asset-input'

export function GLBCatalogPanel() {
  const { items, isLoading } = useCatalog()
  const [editing, setEditing] = useState<CatalogItem | null>(null)

  const handleTileClick = (item: CatalogItem) => {
    const editor = useEditor.getState()
    editor.setSelectedItem(toAssetInput(item))
    if (editor.phase !== 'furnish') editor.setPhase('furnish')
    if (editor.mode !== 'build') editor.setMode('build')
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <UploadZone />
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground text-xs">Chargement…</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <CatalogTile
              item={item}
              key={item.id}
              onClick={handleTileClick}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}
      {editing && <EditItemModal item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
