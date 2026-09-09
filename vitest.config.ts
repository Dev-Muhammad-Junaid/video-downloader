import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        // Only the pure-logic suite runs here. The feature-level checks live in
        // scripts/smoke-test.mjs, because they need a real server, real
        // binaries and real files — things a unit runner shouldn't fake.
        include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
        environment: "node",
    },
    resolve: {
        alias: { "@": path.resolve(__dirname, "src") },
    },
});
