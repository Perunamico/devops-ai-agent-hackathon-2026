import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const nextConfig = (phase: string): NextConfig => {
  const config: NextConfig = {
    images: {
      unoptimized: true,
    },
  };

  if (phase === PHASE_DEVELOPMENT_SERVER) {
    config.rewrites = async () => [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/:path*',
      },
    ];
  } else {
    config.output = 'export';
  }

  return config;
};

export default nextConfig;
