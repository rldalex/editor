'use client'

import { type SidebarTab, ViewerToolbarLeft, ViewerToolbarRight } from '@pascal-app/editor'
import { EditorWithHA } from '../ha/EditorWithHA'
import { GLBCatalogPanel } from '../glb-catalog'
import { localDeleteAsset, localUploadAsset } from '../uploads/local-upload-handlers'

const SIDEBAR_TABS: (SidebarTab & { component: React.ComponentType })[] = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null, // Built-in SitePanel handles this
  },
  {
    id: 'catalog',
    label: 'Catalogue',
    component: GLBCatalogPanel,
  },
]

const SITE_PANEL_PROPS = {
  projectId: 'local-editor',
  onUploadAsset: localUploadAsset,
  onDeleteAsset: localDeleteAsset,
}

export default function Home() {
  return (
    <div className="h-screen w-screen">
      <EditorWithHA
        layoutVersion="v2"
        projectId="local-editor"
        sidebarTabs={SIDEBAR_TABS}
        sitePanelProps={SITE_PANEL_PROPS}
        viewerToolbarLeft={<ViewerToolbarLeft />}
        viewerToolbarRight={<ViewerToolbarRight />}
      />
    </div>
  )
}
