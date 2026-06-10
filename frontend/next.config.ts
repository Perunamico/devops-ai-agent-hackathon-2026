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
        destination: 'http://127.0.0.1:8080/:path*',
      },
    ];
  } else {
    config.output = 'export';
  }

  return config;
};

export default nextConfig;
