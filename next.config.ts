import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['@astryxdesign/core'],
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
