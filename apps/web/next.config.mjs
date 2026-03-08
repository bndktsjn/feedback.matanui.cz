/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    const apiHost = process.env.API_HOST || 'localhost';
    const apiPort = process.env.API_PORT || 3001;
    return [
      {
        source: '/api/:path*',
        destination: `http://${apiHost}:${apiPort}/api/:path*`,
      },
      {
        source: '/static/:path*',
        destination: `http://${apiHost}:${apiPort}/api/static/:path*`,
      },
    ];
  },
};

export default nextConfig;
