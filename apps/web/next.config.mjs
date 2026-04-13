/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'localhost:3002'],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize native modules that can't be bundled
      config.externals = [
        ...(config.externals || []),
        'node-telegram-bot-api',
        'playwright-core',
        'playwright',
      ];
    }
    return config;
  },
};

export default nextConfig;
