import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Self-contained server bundle (server.js + only the deps it needs), so the
  // packaged Electron app doesn't need a full `node_modules` install shipped
  // alongside it. Unused for `next dev`.
  output: "standalone",
  serverExternalPackages: ["sharp"],
  // getFfmpegPath() (src/lib/ffmpeg.ts) resolves the bundled ffmpeg binary via
  // a raw path.join() string, not an actual require() — deliberately, since
  // importing @ffmpeg-installer/ffmpeg's own module breaks under Turbopack.
  // But that means Next's build-time file tracer (which only follows real
  // import/require chains) has no reason to include that binary in the
  // standalone output, so without this it would be silently missing from a
  // packaged build. Force it in explicitly (both Mac architectures).
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/@ffmpeg-installer/darwin-arm64/**",
      "./node_modules/@ffmpeg-installer/darwin-x64/**",
    ],
  },
  turbopack: {
    // Pin workspace root so Turbopack doesn't walk up and find a stray
    // package.json above the project directory.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
