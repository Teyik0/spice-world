import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Same-origin API proxy: auth cookies stay first-party and the dashboard
  // pages (/products, /orders…) don't collide with the API routes.
  rewrites: async () => [
    {
      source: "/api/auth/:path*",
      destination: `${process.env.API_URL}/api/auth/:path*`,
    },
    { source: "/api/:path*", destination: `${process.env.API_URL}/:path*` },
  ],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  logging: { browserToTerminal: true },
  images: {
    remotePatterns: [
      {
        hostname: "tlwuosttpx.ufs.sh",
      },
      {
        hostname: "gdpoqnrsa5.ufs.sh",
      },
      {
        hostname: "picsum.photos",
      },
    ],
  },
};

export default nextConfig;
