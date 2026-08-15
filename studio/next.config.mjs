/** @type {import('next').NextConfig} */
const CROCO_API_ORIGIN = process.env.CROCO_LOCAL_API_ORIGIN || 'http://127.0.0.1:4399';

const nextConfig = {
    env: {
        NEXT_PUBLIC_API_URL: '/api/studio',
    },
    async rewrites() {
        return [
            {
                source: '/api/studio/:path*',
                destination: `${CROCO_API_ORIGIN}/api/studio/:path*`,
            },
            {
                source: '/api-proxy/:path*',
                destination: `${CROCO_API_ORIGIN}/api/studio/:path*`,
            },
            {
                source: '/files/:path*',
                destination: `${CROCO_API_ORIGIN}/files/:path*`,
            },
        ];
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: "https",
                hostname: "placehold.co",
            },
            {
                protocol: "http",
                hostname: "localhost",
                port: "17177",
            },
        ],
    },
};

export default nextConfig;
