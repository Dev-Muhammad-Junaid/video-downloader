import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";

let cachedFiltersOutput: string | null = null;
let cachedFfmpegPath: string | null = null;

export function getFfmpegPath(): string {
    if (cachedFfmpegPath) return cachedFfmpegPath;

    const override = process.env.APP_FFMPEG_PATH?.trim();
    if (override) {
        cachedFfmpegPath = override;
        return cachedFfmpegPath;
    }

    // Resolve bundled binary without importing @ffmpeg-installer/ffmpeg runtime code,
    // because its dynamic require() breaks under Next.js/Turbopack server bundling.
    const platform = process.platform;
    const arch = process.arch;
    const candidates: string[] = [];

    if (platform === "darwin" && arch === "arm64") {
        candidates.push(path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "darwin-arm64", "ffmpeg"));
    }
    if (platform === "darwin" && arch === "x64") {
        candidates.push(path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "darwin-x64", "ffmpeg"));
    }
    if (platform === "linux" && arch === "x64") {
        candidates.push(path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg"));
    }
    if (platform === "linux" && arch === "arm64") {
        candidates.push(path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "linux-arm64", "ffmpeg"));
    }
    if (platform === "win32" && arch === "x64") {
        candidates.push(path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe"));
    }
    if (platform === "win32" && arch === "ia32") {
        candidates.push(path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "win32-ia32", "ffmpeg.exe"));
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            cachedFfmpegPath = candidate;
            return cachedFfmpegPath;
        }
    }

    // Last fallback for dev environments where system ffmpeg exists.
    cachedFfmpegPath = "ffmpeg";
    return cachedFfmpegPath;
}

export function getFfmpegDir(): string {
    return path.dirname(getFfmpegPath());
}

function getFiltersOutput(): string {
    if (cachedFiltersOutput) return cachedFiltersOutput;
    const probe = spawnSync(getFfmpegPath(), ["-hide_banner", "-filters"], { encoding: "utf-8" });
    cachedFiltersOutput = `${probe.stdout || ""}\n${probe.stderr || ""}`.toLowerCase();
    return cachedFiltersOutput;
}

export function ensureFfmpegFilterSupported(filterName: string, featureName: string) {
    const output = getFiltersOutput();
    if (!output.includes(` ${filterName.toLowerCase()} `)) {
        throw new Error(
            `Bundled FFmpeg is missing the '${filterName}' filter required for ${featureName}.`
        );
    }
}

