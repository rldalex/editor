import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Maison 3D — Kiosk',
  description: 'Tablette murale maison connectée',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
