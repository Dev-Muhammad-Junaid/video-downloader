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

/**
 * Reads a media file's duration in seconds, or null when it can't be
 * determined. Shared so the download path and the watch-folder scan agree —
 * they previously disagreed, and only the scan probed at all.
 */
export function probeDuration(filePath: string): number | null {
    try {
        const out = spawnSync(getFfprobePath(), [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            filePath,
        ], { encoding: "utf-8", timeout: 30_000 });

        const seconds = parseFloat((out.stdout || "").trim());
        return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    } catch {
        return null;
    }
}

export function getFfmpegDir(): string {
    return path.dirname(getFfmpegPath());
}

let cachedFfprobePath: string | null = null;

/**
 * Resolves the bundled ffprobe the same way getFfmpegPath resolves ffmpeg.
 *
 * ffprobe is NOT part of @ffmpeg-installer — that package ships only the
 * ffmpeg binary — so looking for it next to ffmpeg (which is what the preflight
 * check used to do) never found it, and every caller fell through to a bare
 * "ffprobe" PATH lookup. On a machine without a system ffmpeg install that
 * simply fails, which is why durations came back empty rather than erroring.
 */
export function getFfprobePath(): string {
    if (cachedFfprobePath) return cachedFfprobePath;

    const override = process.env.APP_FFPROBE_PATH?.trim();
    if (override) {
        cachedFfprobePath = override;
        return cachedFfprobePath;
    }

    // Same reasoning as getFfmpegPath: build the path by hand rather than
    // requiring the installer package, whose dynamic require() breaks under
    // Next/Turbopack server bundling.
    const platform = process.platform;
    const arch = process.arch;
    const exe = platform === "win32" ? "ffprobe.exe" : "ffprobe";
    const candidates = [
        path.join(process.cwd(), "node_modules", "@ffprobe-installer", `${platform}-${arch}`, exe),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            cachedFfprobePath = candidate;
            return cachedFfprobePath;
        }
    }

    // Last fallback for dev environments where a system ffprobe exists.
    cachedFfprobePath = "ffprobe";
    return cachedFfprobePath;
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

/**
 * Timestamps (seconds) of every keyframe in a video's primary video stream.
 *
 * A stream-copy trim can only cut at a keyframe, so these are the only points
 * a fast trim can actually honour. The editor's slider steps in 0.1s, which
 * quietly promised precision the export could not deliver: measured on a real
 * download, keyframes sat 0.48s to 5.8s apart, so a cut set at 7.5s actually
 * began at 6.8s with nothing said about it.
 *
 * Cheap enough to run when the editor opens — 0.15s for a 7.5 minute file,
 * roughly a third of a millisecond per second of video.
 *
 * Returns [] when the file can't be probed; callers should treat that as
 * "snapping unavailable" rather than an error.
 */
export function probeKeyframes(filePath: string): number[] {
    try {
        const out = spawnSync(getFfprobePath(), [
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "packet=pts_time,flags",
            "-of", "csv=p=0",
            filePath,
        ], { encoding: "utf-8", timeout: 60_000, maxBuffer: 32 * 1024 * 1024 });

        return (out.stdout || "")
            .split("\n")
            .filter((line) => line.includes("K"))          // K_ flag marks a keyframe
            .map((line) => parseFloat(line.split(",")[0]))
            .filter((t) => Number.isFinite(t))
            .sort((a, b) => a - b);
    } catch {
        return [];
    }
}

/** The keyframe at or before `time`, i.e. where a stream copy would really
 *  start if asked to cut there. Falls back to `time` when unknown. */
export function keyframeAtOrBefore(keyframes: number[], time: number): number {
    let best = keyframes.length > 0 ? keyframes[0] : time;
    for (const k of keyframes) {
        if (k > time + 1e-6) break;
        best = k;
    }
    return best;
}
