import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  turbopack: {
    // Pin workspace root so Turbopack doesn't walk up and find a stray
    // package.json above the project directory.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
