/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: standalone mode removed — causes _client-reference-manifest.js missing errors
  // in Next.js 14.2.x with App Router. Using standard next start instead.
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs', 'pdf-parse', '@prisma/client', 'prisma'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
}

export default nextConfig
