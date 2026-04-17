'use client'

import { type SidebarTab, ViewerToolbarLeft, ViewerToolbarRight } from '@pascal-app/editor'
import { EditorWithHA } from '../ha/EditorWithHA'

const SIDEBAR_TABS: (SidebarTab & { component: React.ComponentType })[] = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null, // Built-in SitePanel handles this
  },
]

export default function Home() {
  return (
    <div className="h-screen w-screen">
      <EditorWithHA
        layoutVersion="v2"
        projectId="local-editor"
        sidebarTabs={SIDEBAR_TABS}
        viewerToolbarLeft={<ViewerToolbarLeft />}
        viewerToolbarRight={<ViewerToolbarRight />}
      />
    </div>
  )
}
