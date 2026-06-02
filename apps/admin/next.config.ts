import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-hosting on a VPS/ECS: emit a standalone server bundle when
  // BUILD_STANDALONE=true (see env.example.txt). On Vercel this stays unset.
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.slingacademy.com',
        port: ''
      }
    ]
  },
  transpilePackages: ['geist'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  }
};
export default nextConfig;
