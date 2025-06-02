
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    allowedDevOrigins: [
        "http://6000-firebase-studio-1747161033458.cluster-ejd22kqny5htuv5dfowoyipt52.cloudworkstations.dev",
        // It's also good practice to keep localhost if you ever run it locally without Docker port mapping,
        // or if other tools expect it.
        "http://localhost:9002" 
    ],
  },
};

export default nextConfig;
