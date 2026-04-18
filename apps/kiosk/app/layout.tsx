import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Maison 3D — Kiosk',
  description: 'Tablette murale maison connectée',
}

// Fully Kiosk Browser target : lock viewport to prevent pinch-zoom and
// accidental UA zoom from breaking the fullscreen R3F canvas layout.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
