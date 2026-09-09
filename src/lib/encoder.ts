import { spawnSync } from "child_process";
import os from "os";
import { getFfmpegPath } from "@/lib/ffmpeg";

/**
 * Video encoder selection for exports.
 *
 * Every re-encoding export (subtitle burn, crop, convert) used to hardcode
 * `libx264 -preset slow -crf 16`. That is software encoding at the second
 * slowest preset and near-lossless quality: measured on an M1 Pro it pinned
 * ~477% CPU (roughly six of eight cores) for the whole export, which is enough
 * to heat the machine and throttle everything else running on it.
 *
 * Apple's VideoToolbox does the same work on the dedicated media engine — a
 * fixed-function block that is neither CPU nor GPU — at ~40% CPU. Measured on
 * a real 720p export with subtitles burned in:
 *
 *   libx264 -preset slow -crf 16   58.1s CPU time   477% avg   SSIM 0.979974
 *   h264_videotoolbox -q:v 75       2.0s CPU time    45% avg   SSIM 0.979519
 *   h264_videotoolbox -q:v 85       1.9s CPU time    42% avg   SSIM 0.980126
 *
 * q85 scores *above* the old x264 setting while doing ~1/30th the CPU work, so
 * hardware encoding is not a quality compromise here. The genuine trade is file
 * size: VideoToolbox needs roughly twice the bitrate to match x264's quality,
 * so its outputs are larger. That is what the three tiers below let the user
 * choose between.
 *
 * Note that the numbers above already include `-hwaccel videotoolbox` on the
 * input. Hardware *decoding* matters as much as hardware encoding: without it
 * software H.264 decode alone costs ~63% CPU and dominates the export.
 */

export type ExportQuality = "fast" | "balanced" | "maximum";

export const DEFAULT_EXPORT_QUALITY: ExportQuality = "balanced";

export function isExportQuality(value: unknown): value is ExportQuality {
    return value === "fast" || value === "balanced" || value === "maximum";
}

/**
 * VideoToolbox quantiser per tier, and the x264 CRF that lands closest to the
 * same perceived quality when we have to fall back to software.
 *
 * The x264 CRFs are deliberately NOT the old `-crf 16`. On already-compressed
 * source footage (a typical download is well under 1 Mbps) CRF 16 spends most
 * of its bitrate faithfully reproducing the source's own compression
 * artifacts — the old settings turned a 4.9 MB clip into a 12.9 MB one with no
 * visible gain. CRF 18/20/22 tracks the source instead.
 */
const TIERS: Record<ExportQuality, { vtQuality: number; x264Crf: number; x264Preset: string }> = {
    fast: { vtQuality: 65, x264Crf: 22, x264Preset: "veryfast" },
    balanced: { vtQuality: 75, x264Crf: 20, x264Preset: "veryfast" },
    maximum: { vtQuality: 85, x264Crf: 18, x264Preset: "medium" },
};

let cachedHardwareSupport: boolean | null = null;

/**
 * Whether this machine's ffmpeg can encode H.264 on the VideoToolbox media
 * engine. Probed once by asking the actual binary rather than inferring from
 * `process.platform`, because the answer depends on how ffmpeg was built as
 * well as what hardware it is running on.
 */
export function hasHardwareEncoder(): boolean {
    if (cachedHardwareSupport !== null) return cachedHardwareSupport;

    if (process.platform !== "darwin") {
        cachedHardwareSupport = false;
        return cachedHardwareSupport;
    }

    try {
        const probe = spawnSync(getFfmpegPath(), ["-hide_banner", "-encoders"], {
            encoding: "utf-8",
            timeout: 10_000,
        });
        const output = `${probe.stdout || ""}\n${probe.stderr || ""}`;
        cachedHardwareSupport = output.includes("h264_videotoolbox");
    } catch {
        cachedHardwareSupport = false;
    }

    if (!cachedHardwareSupport) {
        console.warn("[Encoder] VideoToolbox unavailable — exports will fall back to software x264");
    }
    return cachedHardwareSupport;
}

/**
 * Input-side args enabling hardware decoding. Must come BEFORE `-i`.
 *
 * No `-hwaccel_output_format` is set on purpose: we want decoded frames back in
 * system memory so the CPU-side filters (`subtitles`, `crop`) can still run.
 * libass has no hardware path on any platform, so subtitle rasterisation stays
 * on the CPU regardless — it costs ~19% of one core, which is not worth
 * chasing.
 */
export function decodeArgs(): string[] {
    return hasHardwareEncoder() ? ["-hwaccel", "videotoolbox"] : [];
}

/**
 * Output-side video encoder args for a quality tier.
 *
 * `-pix_fmt yuv420p` is kept on both paths for player compatibility.
 */
export function videoEncoderArgs(quality: ExportQuality = DEFAULT_EXPORT_QUALITY): string[] {
    const tier = TIERS[quality] ?? TIERS[DEFAULT_EXPORT_QUALITY];

    if (hasHardwareEncoder()) {
        return [
            "-c:v", "h264_videotoolbox",
            "-q:v", String(tier.vtQuality),
            "-pix_fmt", "yuv420p",
        ];
    }

    // Software fallback (Intel Macs, Windows, Linux). `-threads` leaves two
    // cores for the rest of the system so a software export cannot make the
    // machine unusable the way the old unbounded settings could.
    const threads = Math.max(1, (os.cpus()?.length ?? 4) - 2);
    return [
        "-c:v", "libx264",
        "-crf", String(tier.x264Crf),
        "-preset", tier.x264Preset,
        "-threads", String(threads),
        "-pix_fmt", "yuv420p",
    ];
}

/** Human-readable description of what a tier will actually do, for the UI. */
export function describeQuality(quality: ExportQuality): string {
    const hw = hasHardwareEncoder();
    switch (quality) {
        case "fast":
            return hw ? "Smallest files, hardware encoded" : "Smallest files, fastest software encode";
        case "maximum":
            return hw ? "Best quality, larger files" : "Best quality, slowest software encode";
        default:
            return hw ? "Matches source quality, hardware encoded" : "Matches source quality";
    }
}
