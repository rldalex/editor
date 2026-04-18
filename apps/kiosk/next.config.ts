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
  experimental: {
    serverActions: { bodySizeLimit: '100mb' },
  },
}

export default nextConfig
