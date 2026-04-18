import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@pascal-app/core',
    '@pascal-app/viewer',
    '@maison-3d/ha-bridge',
    '@maison-3d/ha-systems',
    '@maison-3d/scene-bundle',
    'three',
  ],
  // Pin react/three/r3f/drei to this app's node_modules so turbopack never
  // resolves duplicates via bun hoisting — R3F breaks silently when three
  // or react is loaded twice (singleton identity).
  turbopack: {
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: '100mb' },
  },
}

export default nextConfig
