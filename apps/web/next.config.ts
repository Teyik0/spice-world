import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	experimental: {
		optimizePackageImports: ["lucide-react"],
		browserDebugInfoInTerminal: true,
	},
	images: {
		remotePatterns: [
			{
				hostname: "tlwuosttpx.ufs.sh",
			},
			{
				hostname: "picsum.photos",
			},
		],
	},
};

export default nextConfig;
