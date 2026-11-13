import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Prisma and the PDF libraries on the Node runtime, unbundled.
  serverExternalPackages: ["@prisma/client", "pdf-lib", "@pdf-lib/fontkit"],
  // Uploaded files and the SQLite database change at runtime; don't let the
  // dev server treat them as source changes.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/storage/**", "**/prisma/*.db*"],
      };
    }
    return config;
  },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
