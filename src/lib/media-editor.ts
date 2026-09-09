import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "@/lib/prisma";
import { generateThumbnail } from "@/lib/thumbnail";
import { ensureFfmpegFilterSupported, getFfmpegPath } from "@/lib/ffmpeg";
import { decodeArgs, videoEncoderArgs, DEFAULT_EXPORT_QUALITY, type ExportQuality } from "@/lib/encoder";

import { parseTimeToSeconds } from "@/lib/time";

/**
 * FFmpeg trim args for a [start, end] window. We seek the input with `-ss`
 * (fast) and limit the OUTPUT with `-t DURATION` — NOT `-to END`. With an
 * input-side `-ss`, FFmpeg resets output timestamps to 0, so `-to END` is
 * measured from that new zero and would write END seconds of output (e.g.
 * trimming 21:40→21:45 of a 44-min clip wrote ~21 min). `-t (end-start)`
 * writes exactly the intended duration, so the export is both correct and
 * fast (work is proportional to the clip length, not the source length).
 */
function trimArgs(input: string, startTime: string, endTime: string, hwDecode = false): string[] {
    const dur = Math.max(0, parseTimeToSeconds(endTime) - parseTimeToSeconds(startTime));
    return [...(hwDecode ? decodeArgs() : []), "-ss", String(startTime), "-i", input, "-t", String(dur)];
}

/**
 * Absolute path to the subtitle fonts bundled with the app — the *same* TTF
 * files JASSUB loads in the browser preview (`public/fonts`). Handing this to
 * libass through the `subtitles` filter's `fontsdir` option is what makes the
 * burn-in match the preview 1:1. Without it libass can't resolve Roboto /
 * Anton / Oswald / etc. (they aren't installed system-wide) and silently
 * substitutes a default face, so every export drifts from what the user saw.
 */
const SUBTITLE_FONTS_DIR = path.join(process.cwd(), "public", "fonts");

/** Escape a filesystem path for use inside an ffmpeg -vf filter argument. */
function escapeForFfFilter(p: string): string {
    return p.replace(/\\/g, "\\\\\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/** Build the `subtitles=` filter for an ASS file, always pinning fontsdir so
 *  the burn uses the same fonts as the preview. */
function buildSubtitlesFilter(assPath: string): string {
    return `subtitles=filename='${escapeForFfFilter(assPath)}':fontsdir='${escapeForFfFilter(SUBTITLE_FONTS_DIR)}'`;
}

/** The spawned ffmpeg child process (for pause/resume/cancel registration). */
type FfmpegProc = ReturnType<typeof spawn>;

// Helper to spawn ffmpeg and return a promise
/**
 * Spawn ffmpeg.
 * - `onProgress`: parse the `time=HH:MM:SS.ss` ffmpeg prints and report elapsed
 *   output seconds, so callers can drive a 0–100 progress bar.
 * - `onSpawn`: hand the live ChildProcess to the caller so it can be registered
 *   for pause (SIGSTOP) / resume (SIGCONT) / cancel (SIGTERM).
 *
 * On any non-zero exit (including a SIGTERM cancel) the partial output file —
 * always the last arg — is deleted so cancelled/failed exports don't leave a
 * broken file behind.
 */
function runFfmpeg(
    args: string[],
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    onSpawn?: (proc: ReturnType<typeof spawn>) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(getFfmpegPath(), args);
        onSpawn?.(ffmpeg);

        const cleanupPartialOutput = () => {
            const outPath = args[args.length - 1];
            if (outPath && !outPath.startsWith("-")) {
                try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch { /* ignore */ }
            }
        };

        let errorOutput = "";
        // Total media duration, parsed once from ffmpeg's "Duration: HH:MM:SS.ss"
        // line, so progress works even when the DB has no duration for the source
        // (the denominator otherwise defaults to 0 and the bar stays at 0%).
        let totalSeconds: number | undefined;
        ffmpeg.stderr.on("data", (data) => {
            const chunk = data.toString();
            errorOutput += chunk;
            // Keep only the tail so errorOutput can't grow unbounded on long jobs.
            if (errorOutput.length > 8192) errorOutput = errorOutput.slice(-8192);
            if (totalSeconds === undefined) {
                const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(chunk);
                if (d) totalSeconds = (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]);
            }
            if (onProgress) {
                // ffmpeg emits e.g. "frame= 120 ... time=00:00:04.10 bitrate=..."
                let m: RegExpExecArray | null;
                const re = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/g;
                let last: RegExpExecArray | null = null;
                while ((m = re.exec(chunk)) !== null) last = m;
                if (last) {
                    const secs = (+last[1]) * 3600 + (+last[2]) * 60 + parseFloat(last[3]);
                    onProgress(secs, totalSeconds);
                }
            }
        });

        ffmpeg.on("error", (err) => {
            cleanupPartialOutput();
            reject(new Error(`Failed to start FFmpeg: ${err.message}`));
        });

        ffmpeg.on("close", (code, signal) => {
            if (code === 0) {
                resolve();
            } else {
                cleanupPartialOutput();
                reject(new Error(
                    signal ? `FFmpeg terminated (${signal})` : `FFmpeg exited with code ${code}: ${errorOutput}`,
                ));
            }
        });
    });
}

let subtitlesFilterSupported: boolean | null = null;
function ensureSubtitleFilterSupport() {
    if (subtitlesFilterSupported) return;
    ensureFfmpegFilterSupported("subtitles", "subtitle burn-in export");
    subtitlesFilterSupported = true;
}

export async function trimVideo(
    videoId: string,
    startTime: string,
    endTime: string,
    inheritSrtContent?: string,
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    registerProc?: (proc: FfmpegProc) => void,
) {
    const originalVideo = await prisma.video.findUnique({
        where: { id: videoId }
    });

    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_clipped_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    // Fast keyframe-accurate clip via stream copy. trimArgs uses -ss + -t
    // (duration) so the output is exactly the trimmed length.
    const args = [
        "-y",               // Overwrite
        ...trimArgs(originalVideo.localPath, startTime, endTime),
        "-c", "copy",       // Stream copy (very fast, but respects keyframes only)
        newFilePath
    ];

    console.log(`[FFmpeg Trim] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args, onProgress, registerProc);

    let fileSize = 0;
    try {
        const stats = fs.statSync(newFilePath);
        fileSize = stats.size;
    } catch (e) { }

    // Create a new DB entry for the clipped video
    const clippedVideo = await prisma.video.create({
        data: {
            title: `${originalVideo.title} (Trimmed)`,
            originalUrl: originalVideo.originalUrl,
            sourcePlatform: originalVideo.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: originalVideo.mediaType,
            duration: parseTimeToSeconds(endTime) - parseTimeToSeconds(startTime),
        }
    });

    generateThumbnail(newFilePath, clippedVideo.id, clippedVideo.mediaType).then(async (thumbPath) => {
        if (thumbPath) {
            await prisma.video.update({ where: { id: clippedVideo.id }, data: { thumbnailPath: thumbPath } });
        }
    }).catch(console.error);

    if (inheritSrtContent) {
        await saveInheritedSubtitles(clippedVideo.id, newFilePath, inheritSrtContent);
    }

    return clippedVideo;
}

export async function cropVideo(
    videoId: string,
    w: number,
    h: number,
    x: number,
    y: number,
    inheritSrtContent?: string,
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    registerProc?: (proc: FfmpegProc) => void,
    quality: ExportQuality = DEFAULT_EXPORT_QUALITY,
) {
    const originalVideo = await prisma.video.findUnique({
        where: { id: videoId }
    });

    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_cropped_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    // Build FFmpeg command for cropping. 
    // This REQUIRES re-encoding, so it takes longer.
    const filterArg = `crop=${w}:${h}:${x}:${y}`;
    const args = [
        "-y",
        ...decodeArgs(),
        "-i", originalVideo.localPath,
        "-filter:v", filterArg,
        ...videoEncoderArgs(quality),
        "-c:a", "copy",       // Copy audio track to save time
        newFilePath
    ];

    console.log(`[FFmpeg Crop] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args, onProgress, registerProc);

    let fileSize = 0;
    try {
        const stats = fs.statSync(newFilePath);
        fileSize = stats.size;
    } catch (e) { }

    // Create a new DB entry for the cropped video
    const croppedVideo = await prisma.video.create({
        data: {
            title: `${originalVideo.title} (Cropped)`,
            originalUrl: originalVideo.originalUrl,
            sourcePlatform: originalVideo.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: originalVideo.mediaType,
            duration: originalVideo.duration, // Should be roughly the same
        }
    });

    generateThumbnail(newFilePath, croppedVideo.id, croppedVideo.mediaType).then(async (thumbPath) => {
        if (thumbPath) {
            await prisma.video.update({ where: { id: croppedVideo.id }, data: { thumbnailPath: thumbPath } });
        }
    }).catch(console.error);

    if (inheritSrtContent) {
        await saveInheritedSubtitles(croppedVideo.id, newFilePath, inheritSrtContent);
    }

    return croppedVideo;
}

/**
 * Combined trim + crop in a single FFmpeg pass.
 * This trims the time range AND applies a crop filter simultaneously.
 */
export async function trimAndCrop(
    videoId: string,
    startTime: string,
    endTime: string,
    w: number,
    h: number,
    x: number,
    y: number,
    inheritSrtContent?: string,
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    registerProc?: (proc: FfmpegProc) => void,
    quality: ExportQuality = DEFAULT_EXPORT_QUALITY,
) {
    const originalVideo = await prisma.video.findUnique({
        where: { id: videoId }
    });

    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_trimcrop_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    const filterArg = `crop=${w}:${h}:${x}:${y}`;
    const args = [
        "-y",
        ...trimArgs(originalVideo.localPath, startTime, endTime, true),
        "-filter:v", filterArg,
        ...videoEncoderArgs(quality),
        "-c:a", "copy",
        newFilePath
    ];

    console.log(`[FFmpeg TrimCrop] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args, onProgress, registerProc);

    let fileSize = 0;
    try {
        const stats = fs.statSync(newFilePath);
        fileSize = stats.size;
    } catch (e) { }

    const resultVideo = await prisma.video.create({
        data: {
            title: `${originalVideo.title} (Trimmed & Cropped)`,
            originalUrl: originalVideo.originalUrl,
            sourcePlatform: originalVideo.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: originalVideo.mediaType,
            duration: parseTimeToSeconds(endTime) - parseTimeToSeconds(startTime),
        }
    });

    generateThumbnail(newFilePath, resultVideo.id, resultVideo.mediaType).then(async (thumbPath) => {
        if (thumbPath) {
            await prisma.video.update({ where: { id: resultVideo.id }, data: { thumbnailPath: thumbPath } });
        }
    }).catch(console.error);

    if (inheritSrtContent) {
        await saveInheritedSubtitles(resultVideo.id, newFilePath, inheritSrtContent);
    }

    return resultVideo;
}



/** Convert SRT content to VTT string (timestamps HH:MM:SS,mmm → HH:MM:SS.mmm) */
function srtToVtt(srtContent: string): string {
    return "WEBVTT\n\n" + srtContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
}

/** Extract plain text from SRT content for full-text search */
function extractTextFromSrt(srtContent: string): string {
    return srtContent
        .split(/\n+/)
        .filter(line => {
            const t = line.trim();
            return t && !/^\d+$/.test(t) && !/\d{2}:\d{2}:\d{2}/.test(t);
        })
        .join(" ");
}

/** Write inherited subtitles as VTT next to the output video and mark the DB entry as transcribed */
async function saveInheritedSubtitles(
    videoId: string,
    videoFilePath: string,
    srtContent: string
): Promise<void> {
    if (!srtContent?.trim()) return;
    try {
        const parsedPath = path.parse(videoFilePath);
        const vttPath = path.join(parsedPath.dir, `${parsedPath.name}_subtitles.vtt`);
        fs.writeFileSync(vttPath, srtToVtt(srtContent), "utf-8");
        await prisma.video.update({
            where: { id: videoId },
            data: {
                transcriptPath: vttPath,
                transcriptStatus: "completed",
                transcriptText: extractTextFromSrt(srtContent),
            },
        });
    } catch (err) {
        console.error("[SubtitleInherit] Failed to save inherited subtitles:", err);
    }
}

export async function convertToMp4(videoId: string) {
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    if (parsedPath.ext.toLowerCase() === ".mp4") throw new Error("File is already MP4");

    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_converted_${newId}.mp4`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    const args = ["-y", ...decodeArgs(), "-i", originalVideo.localPath, ...videoEncoderArgs(DEFAULT_EXPORT_QUALITY), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", newFilePath];
    console.log(`[FFmpeg Convert] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args);

    let fileSize = 0;
    try { fileSize = fs.statSync(newFilePath).size; } catch { }

    const convertedVideo = await prisma.video.create({
        data: {
            title: `${originalVideo.title} (MP4)`,
            originalUrl: originalVideo.originalUrl,
            sourcePlatform: originalVideo.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: "video",
            duration: originalVideo.duration,
        }
    });

    generateThumbnail(newFilePath, convertedVideo.id, "video").then(async (tp) => {
        if (tp) await prisma.video.update({ where: { id: convertedVideo.id }, data: { thumbnailPath: tp } });
    }).catch(console.error);

    return convertedVideo;
}

export async function trimAudio(
    videoId: string,
    startTime: string,
    endTime: string,
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    registerProc?: (proc: FfmpegProc) => void,
) {
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Audio file not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_trimmed_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    const args = ["-y", ...trimArgs(originalVideo.localPath, startTime, endTime), "-c", "copy", newFilePath];
    console.log(`[FFmpeg TrimAudio] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args, onProgress, registerProc);

    let fileSize = 0;
    try { fileSize = fs.statSync(newFilePath).size; } catch { }

    const trimmedAudio = await prisma.video.create({
        data: {
            title: `${originalVideo.title} (Trimmed)`,
            originalUrl: originalVideo.originalUrl,
            sourcePlatform: originalVideo.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: "audio",
            duration: parseTimeToSeconds(endTime) - parseTimeToSeconds(startTime),
        }
    });

    return trimmedAudio;
}

export type AudioFormat = "original" | "mp3" | "m4a" | "wav";
export type VoiceEnhance = "off" | "light" | "studio";

export interface ProcessAudioOptions {
    startTime?: string;       // trim start (seconds or hh:mm:ss); omit for full clip
    endTime?: string;         // trim end
    format?: AudioFormat;     // output container/codec
    bitrate?: string;         // e.g. "192k" (ignored for wav)
    gainDb?: number;          // manual gain in dB (+/-)
    normalize?: boolean;      // EBU R128 loudness normalize
    fadeIn?: number;          // fade-in seconds
    fadeOut?: number;         // fade-out seconds
    enhance?: VoiceEnhance;   // voice clean-up / studio enhancement
}

/**
 * Build the ffmpeg `-af` chain for the audio editor. Order follows audio-engineering
 * convention: clean the signal (enhance) → gain → loudness-normalize → shape edges (fades).
 *
 * Voice enhancement uses the bundled ffmpeg's local DSP filters (no cloud):
 *  - highpass     : remove low-frequency rumble / handling noise
 *  - afftdn       : FFT-based broadband denoise (hiss, fans, background hum)
 *  - deesser      : tame harsh sibilance
 *  - acompressor  : even out level so quiet speech is audible
 *  - equalizer    : cut mud (~200 Hz), lift presence (~3 kHz) for an intelligible "studio" voice
 *  - loudnorm     : land at a consistent -16 LUFS target
 */
function buildAudioFilterChain(opts: ProcessAudioOptions): string {
    const f: string[] = [];

    if (opts.enhance === "light") {
        f.push("highpass=f=80", "afftdn=nf=-20:nr=12", "deesser=i=0.3");
    } else if (opts.enhance === "studio") {
        f.push(
            "highpass=f=90",
            "afftdn=nf=-25:nr=20",
            "deesser=i=0.4",
            "acompressor=threshold=-18dB:ratio=3:attack=20:release=250:makeup=2",
            "equalizer=f=200:t=q:w=1:g=-2",
            "equalizer=f=3000:t=q:w=1.5:g=3",
        );
    }

    if (opts.gainDb && opts.gainDb !== 0) f.push(`volume=${opts.gainDb}dB`);

    // "Studio quality" implies a consistent loudness, so enhancement always normalizes.
    if (opts.normalize || opts.enhance === "light" || opts.enhance === "studio") {
        f.push("loudnorm=I=-16:TP=-1.5:LRA=11");
    }

    if (opts.fadeIn && opts.fadeIn > 0) f.push(`afade=t=in:st=0:d=${opts.fadeIn}`);
    // Fade-out without needing the (possibly unknown) duration: reverse → fade-in → reverse.
    if (opts.fadeOut && opts.fadeOut > 0) f.push("areverse", `afade=t=in:st=0:d=${opts.fadeOut}`, "areverse");

    return f.join(",");
}

/**
 * Unified audio editor: applies any combination of trim, format/bitrate conversion,
 * gain, loudness normalization, fades, and voice enhancement in a single ffmpeg pass,
 * then registers the result as a new library item.
 */
export async function processAudio(
    videoId: string,
    opts: ProcessAudioOptions,
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    registerProc?: (proc: FfmpegProc) => void,
) {
    const original = await prisma.video.findUnique({ where: { id: videoId } });
    if (!original) throw new Error("Audio file not found");
    if (!fs.existsSync(original.localPath)) throw new Error("Original file missing on disk");

    const parsed = path.parse(original.localPath);
    const srcExt = parsed.ext.replace(".", "").toLowerCase();
    const fmt = !opts.format || opts.format === "original" ? srcExt : opts.format;
    const outExt = fmt === "wav" ? "wav" : fmt === "m4a" ? "m4a" : fmt === "mp3" ? "mp3" : srcExt;

    const newId = Math.random().toString(36).substring(2, 15);
    const newFilePath = path.join(parsed.dir, `${parsed.name}_audio_${newId}.${outExt}`);

    const filterChain = buildAudioFilterChain(opts);
    const formatChanged = outExt !== srcExt;
    // Fast lossless path: pure trim, no filters, same container.
    const canStreamCopy = !filterChain && !formatChanged;

    const hasStart = opts.startTime !== undefined && opts.startTime !== "";
    const hasEnd = opts.endTime !== undefined && opts.endTime !== "";
    const args: string[] = ["-y"];
    if (hasStart) args.push("-ss", opts.startTime!);
    args.push("-i", original.localPath);
    // -t DURATION (not -to END): with input -ss, -to is measured from the
    // post-seek zero and would write END seconds of output.
    if (hasEnd) {
        const startSec = hasStart ? parseTimeToSeconds(opts.startTime!) : 0;
        const dur = Math.max(0, parseTimeToSeconds(opts.endTime!) - startSec);
        args.push("-t", String(dur));
    }

    if (filterChain) args.push("-af", filterChain);

    if (canStreamCopy) {
        args.push("-c", "copy");
    } else if (outExt === "wav") {
        args.push("-vn", "-c:a", "pcm_s16le");
    } else if (outExt === "m4a") {
        args.push("-vn", "-c:a", "aac", "-b:a", opts.bitrate || "192k");
    } else {
        args.push("-vn", "-c:a", "libmp3lame", "-b:a", opts.bitrate || "192k");
    }
    args.push(newFilePath);

    console.log(`[FFmpeg ProcessAudio] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args, onProgress, registerProc);

    let fileSize = 0;
    try { fileSize = fs.statSync(newFilePath).size; } catch { }

    // Derive the output duration: trimmed range, else inherit the source's.
    let duration = original.duration ?? null;
    if (opts.startTime !== undefined && opts.endTime !== undefined && opts.startTime !== "" && opts.endTime !== "") {
        duration = parseTimeToSeconds(opts.endTime) - parseTimeToSeconds(opts.startTime);
    }

    const suffix = opts.enhance && opts.enhance !== "off" ? "Enhanced" : "Edited";

    return prisma.video.create({
        data: {
            title: `${original.title} (${suffix})`,
            originalUrl: original.originalUrl,
            sourcePlatform: original.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: "audio",
            duration,
        },
    });
}

export async function trimBurnSubtitles(
    videoId: string,
    startTime: string,
    endTime: string,
    assContent: string,
    inheritSrtContent?: string,
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    registerProc?: (proc: FfmpegProc) => void,
    quality: ExportQuality = DEFAULT_EXPORT_QUALITY,
) {
    ensureSubtitleFilterSupport();
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_trimcap_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);
    const tmpAssPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.ass`);
    // The client already produced the exact ASS the preview rendered — burn it
    // verbatim so the export is byte-identical to the preview.
    fs.writeFileSync(tmpAssPath, assContent, "utf-8");

    try {
        const filterArg = buildSubtitlesFilter(tmpAssPath);
        const args = ["-y", ...trimArgs(originalVideo.localPath, startTime, endTime, true), "-vf", filterArg, ...videoEncoderArgs(quality), "-c:a", "copy", newFilePath];
        console.log(`[FFmpeg TrimBurn] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args, onProgress, registerProc);
    } finally {
        try { fs.unlinkSync(tmpAssPath); } catch { }
    }

    let fileSize = 0;
    try { fileSize = fs.statSync(newFilePath).size; } catch { }

    const resultVideo = await prisma.video.create({
        data: {
            title: `${originalVideo.title} (Trimmed & Captioned)`,
            originalUrl: originalVideo.originalUrl,
            sourcePlatform: originalVideo.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: originalVideo.mediaType,
            duration: parseTimeToSeconds(endTime) - parseTimeToSeconds(startTime),
        }
    });
    generateThumbnail(newFilePath, resultVideo.id, resultVideo.mediaType).then(async (tp) => { if (tp) await prisma.video.update({ where: { id: resultVideo.id }, data: { thumbnailPath: tp } }); }).catch(console.error);
    if (inheritSrtContent) await saveInheritedSubtitles(resultVideo.id, newFilePath, inheritSrtContent);
    return resultVideo;
}

export async function cropBurnSubtitles(
    videoId: string,
    w: number, h: number, x: number, y: number,
    assContent: string,
    inheritSrtContent?: string,
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    registerProc?: (proc: FfmpegProc) => void,
    quality: ExportQuality = DEFAULT_EXPORT_QUALITY,
) {
    ensureSubtitleFilterSupport();
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_cropcap_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);
    const tmpAssPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.ass`);
    // Client-composed ASS (built against the crop output dims) — burn verbatim.
    fs.writeFileSync(tmpAssPath, assContent, "utf-8");

    try {
        const filterArg = `crop=${w}:${h}:${x}:${y},${buildSubtitlesFilter(tmpAssPath)}`;
        const args = ["-y", ...decodeArgs(), "-i", originalVideo.localPath, "-vf", filterArg, ...videoEncoderArgs(quality), "-c:a", "copy", newFilePath];
        console.log(`[FFmpeg CropBurn] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args, onProgress, registerProc);
    } finally {
        try { fs.unlinkSync(tmpAssPath); } catch { }
    }

    let fileSize = 0;
    try { fileSize = fs.statSync(newFilePath).size; } catch { }

    const resultVideo = await prisma.video.create({
        data: {
            title: `${originalVideo.title} (Cropped & Captioned)`,
            originalUrl: originalVideo.originalUrl,
            sourcePlatform: originalVideo.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: originalVideo.mediaType,
            duration: originalVideo.duration,
        }
    });
    generateThumbnail(newFilePath, resultVideo.id, resultVideo.mediaType).then(async (tp) => { if (tp) await prisma.video.update({ where: { id: resultVideo.id }, data: { thumbnailPath: tp } }); }).catch(console.error);
    if (inheritSrtContent) await saveInheritedSubtitles(resultVideo.id, newFilePath, inheritSrtContent);
    return resultVideo;
}

export async function trimCropBurnSubtitles(
    videoId: string,
    startTime: string, endTime: string,
    w: number, h: number, x: number, y: number,
    assContent: string,
    inheritSrtContent?: string,
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    registerProc?: (proc: FfmpegProc) => void,
    quality: ExportQuality = DEFAULT_EXPORT_QUALITY,
) {
    ensureSubtitleFilterSupport();
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_trimcropcap_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);
    const tmpAssPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.ass`);
    // Client-composed ASS (built against the crop output dims) — burn verbatim.
    fs.writeFileSync(tmpAssPath, assContent, "utf-8");

    try {
        const filterArg = `crop=${w}:${h}:${x}:${y},${buildSubtitlesFilter(tmpAssPath)}`;
        const args = ["-y", ...trimArgs(originalVideo.localPath, startTime, endTime, true), "-vf", filterArg, ...videoEncoderArgs(quality), "-c:a", "copy", newFilePath];
        console.log(`[FFmpeg TrimCropBurn] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args, onProgress, registerProc);
    } finally {
        try { fs.unlinkSync(tmpAssPath); } catch { }
    }

    let fileSize = 0;
    try { fileSize = fs.statSync(newFilePath).size; } catch { }

    const resultVideo = await prisma.video.create({
        data: {
            title: `${originalVideo.title} (Trimmed, Cropped & Captioned)`,
            originalUrl: originalVideo.originalUrl,
            sourcePlatform: originalVideo.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: originalVideo.mediaType,
            duration: parseTimeToSeconds(endTime) - parseTimeToSeconds(startTime),
        }
    });
    generateThumbnail(newFilePath, resultVideo.id, resultVideo.mediaType).then(async (tp) => { if (tp) await prisma.video.update({ where: { id: resultVideo.id }, data: { thumbnailPath: tp } }); }).catch(console.error);
    if (inheritSrtContent) await saveInheritedSubtitles(resultVideo.id, newFilePath, inheritSrtContent);
    return resultVideo;
}

export async function burnSubtitles(
    videoId: string,
    assContent: string,
    inheritSrtContent?: string,
    onProgress?: (outSeconds: number, totalSeconds?: number) => void,
    registerProc?: (proc: FfmpegProc) => void,
    quality: ExportQuality = DEFAULT_EXPORT_QUALITY,
) {
    ensureSubtitleFilterSupport();

    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_captioned_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    const tmpAssPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.ass`);
    // The client already produced the exact ASS the preview rendered — burn it
    // verbatim so the export is byte-identical to the preview.
    fs.writeFileSync(tmpAssPath, assContent, "utf-8");

    try {
        const filterArg = buildSubtitlesFilter(tmpAssPath);
        const args = ["-y", ...decodeArgs(), "-i", originalVideo.localPath, "-vf", filterArg, ...videoEncoderArgs(quality), "-c:a", "copy", newFilePath];
        console.log(`[FFmpeg BurnSubs] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args, onProgress, registerProc);
    } finally {
        try { fs.unlinkSync(tmpAssPath); } catch { }
    }

    let fileSize = 0;
    try { fileSize = fs.statSync(newFilePath).size; } catch { }

    const captionedVideo = await prisma.video.create({
        data: {
            title: `${originalVideo.title} (Captioned)`,
            originalUrl: originalVideo.originalUrl,
            sourcePlatform: originalVideo.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: originalVideo.mediaType,
            duration: originalVideo.duration,
        }
    });

    generateThumbnail(newFilePath, captionedVideo.id, captionedVideo.mediaType).then(async (thumbPath) => {
        if (thumbPath) {
            await prisma.video.update({ where: { id: captionedVideo.id }, data: { thumbnailPath: thumbPath } });
        }
    }).catch(console.error);

    if (inheritSrtContent) await saveInheritedSubtitles(captionedVideo.id, newFilePath, inheritSrtContent);

    return captionedVideo;
}

// ─── Image Editing ────────────────────────────────────────────────────────────

export interface ImageEditOptions {
    crop?: { w: number; h: number; x: number; y: number }; // pixel values
    rotation?: "90cw" | "90ccw" | "180" | "fliph" | "flipv";
    brightness?: number; // -1.0 to 1.0, default 0
    contrast?: number;   // 0.0 to 3.0, default 1
    saturation?: number; // 0.0 to 3.0, default 1
    format?: "jpg" | "png" | "webp";
    quality?: number;    // 0-100, for jpg/webp
}

/**
 * Apply crop, rotation/flip, colour adjustments, and/or format conversion to
 * an image using sharp. Always creates a new library item.
 */
export async function editImage(videoId: string, options: ImageEditOptions) {
    const original = await prisma.video.findUnique({ where: { id: videoId } });
    if (!original) throw new Error("Image not found");
    if (!fs.existsSync(original.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(original.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const outExt = options.format ? `.${options.format}` : parsedPath.ext.toLowerCase() || ".jpg";
    const newFileName = `${parsedPath.name}_edited_${newId}${outExt}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    const sharp = (await import("sharp")).default;
    let pipeline = sharp(original.localPath);

    // Crop first so subsequent ops work on the final pixel dimensions
    if (options.crop) {
        const { x, y, w, h } = options.crop;
        pipeline = pipeline.extract({ left: x, top: y, width: w, height: h });
    }

    // Rotation / flip
    if (options.rotation) {
        switch (options.rotation) {
            case "90cw":  pipeline = pipeline.rotate(90);  break;
            case "90ccw": pipeline = pipeline.rotate(-90); break;
            case "180":   pipeline = pipeline.rotate(180); break;
            case "fliph": pipeline = pipeline.flop();      break;
            case "flipv": pipeline = pipeline.flip();      break;
        }
    }

    // Colour adjustments via sharp's modulate / linear
    const needsBrightness  = options.brightness !== undefined && options.brightness !== 0;
    const needsContrast    = options.contrast   !== undefined && options.contrast   !== 1;
    const needsSaturation  = options.saturation !== undefined && options.saturation !== 1;

    if (needsBrightness || needsContrast) {
        // linear(a, b): output = input * a + b  (values in 0-255 range)
        const a = options.contrast   ?? 1;                              // contrast multiplier
        const b = (options.brightness ?? 0) * 128;                     // brightness offset (-128..128)
        pipeline = pipeline.linear(a, b);
    }

    if (needsSaturation) {
        pipeline = pipeline.modulate({ saturation: options.saturation ?? 1 });
    }

    // Output format + quality
    const q = options.quality ?? 85;
    if (outExt === ".jpg" || outExt === ".jpeg") {
        pipeline = pipeline.jpeg({ quality: q });
    } else if (outExt === ".webp") {
        pipeline = pipeline.webp({ quality: q });
    } else if (outExt === ".png") {
        pipeline = pipeline.png();
    }

    console.log(`[Sharp Image] Writing: ${newFilePath}`);
    await pipeline.toFile(newFilePath);

    let fileSize = 0;
    try { fileSize = fs.statSync(newFilePath).size; } catch {}

    const suffix = buildSuffix(options);
    const edited = await prisma.video.create({
        data: {
            title: `${original.title} (${suffix})`,
            originalUrl: original.originalUrl,
            sourcePlatform: original.sourcePlatform,
            localPath: newFilePath,
            fileSize,
            mediaType: "image",
        },
    });

    generateThumbnail(newFilePath, edited.id, "image").then(async (tp) => {
        if (tp) await prisma.video.update({ where: { id: edited.id }, data: { thumbnailPath: tp } });
    }).catch(console.error);

    return edited;
}

function buildSuffix(opts: ImageEditOptions): string {
    const parts: string[] = [];
    if (opts.crop)     parts.push("Cropped");
    if (opts.rotation) parts.push({ "90cw": "Rotated 90°", "90ccw": "Rotated -90°", "180": "Rotated 180°", fliph: "Flipped H", flipv: "Flipped V" }[opts.rotation]);
    const hasAdj = (opts.brightness ?? 0) !== 0 || (opts.contrast ?? 1) !== 1 || (opts.saturation ?? 1) !== 1;
    if (hasAdj)        parts.push("Adjusted");
    if (opts.format)   parts.push(opts.format.toUpperCase());
    return parts.length > 0 ? parts.join(", ") : "Edited";
}
