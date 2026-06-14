import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "@/lib/prisma";
import { generateThumbnail } from "@/lib/thumbnail";
import { ensureFfmpegFilterSupported, getFfmpegPath } from "@/lib/ffmpeg";
import { buildAssFile, type SubtitleStyleConfig } from "@/lib/ass-builder";

function parseTimeToSeconds(time: string): number {
    if (time.includes(":")) {
        const parts = time.split(":").map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return parseFloat(time) || 0;
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

// Helper to spawn ffmpeg and return a promise
function runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(getFfmpegPath(), args);

        let errorOutput = "";
        ffmpeg.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        ffmpeg.on("error", (err) => {
            reject(new Error(`Failed to start FFmpeg: ${err.message}`));
        });

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput}`));
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
    inheritSrtContent?: string
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

    // Build FFmpeg command for fast clipping without re-encoding video if possible,
    // though if we need frame accuracy, it's safer to re-encode or use fast seek.
    // -ss [start] -to [end] -i [input] -c copy [output] is fastest.
    const args = [
        "-y",               // Overwrite
        "-ss", startTime,
        "-i", originalVideo.localPath,
        "-to", endTime,
        "-c", "copy",       // Stream copy (very fast, but respects keyframes only)
        newFilePath
    ];

    console.log(`[FFmpeg Trim] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args);

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
    inheritSrtContent?: string
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
        "-i", originalVideo.localPath,
        "-filter:v", filterArg,
        "-c:a", "copy",       // Copy audio track to save time
        newFilePath
    ];

    console.log(`[FFmpeg Crop] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args);

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
    inheritSrtContent?: string
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
        "-ss", startTime,
        "-i", originalVideo.localPath,
        "-to", endTime,
        "-filter:v", filterArg,
        "-c:a", "copy",
        newFilePath
    ];

    console.log(`[FFmpeg TrimCrop] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args);

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


/**
 * Probe actual video dimensions by reading the container header.
 * Fast: FFmpeg reads only the container metadata, then exits.
 * Falls back to 1280×720 on any error.
 */
async function getVideoDimensions(filePath: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const proc = spawn(getFfmpegPath(), ["-hide_banner", "-i", filePath]);
        let stderr = "";
        proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
        proc.on("close", () => {
            // "Video: h264 ...yuv420p, 1920x1080 [SAR" or "Video: ... 1280x720,"
            const m = stderr.match(/Video:[^\n]*?\s(\d{2,5})x(\d{2,5})[\s,\[]/);
            resolve(m ? { width: parseInt(m[1]), height: parseInt(m[2]) } : { width: 1280, height: 720 });
        });
        proc.on("error", () => resolve({ width: 1280, height: 720 }));
    });
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

    const args = ["-y", "-i", originalVideo.localPath, "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", newFilePath];
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
    endTime: string
) {
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Audio file not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_trimmed_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    const args = ["-y", "-ss", startTime, "-i", originalVideo.localPath, "-to", endTime, "-c", "copy", newFilePath];
    console.log(`[FFmpeg TrimAudio] Running: ffmpeg ${args.join(" ")}`);
    await runFfmpeg(args);

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

export async function trimBurnSubtitles(
    videoId: string,
    startTime: string,
    endTime: string,
    srtContent: string,
    burnOpts: SubtitleStyleConfig,
    inheritSrtContent?: string
) {
    ensureSubtitleFilterSupport();
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_trimcap_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);
    const vDim = await getVideoDimensions(originalVideo.localPath);
    const tmpAssPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.ass`);
    fs.writeFileSync(tmpAssPath, buildAssFile(srtContent, burnOpts, vDim), "utf-8");

    try {
        const filterArg = buildSubtitlesFilter(tmpAssPath);
        const args = ["-y", "-ss", startTime, "-i", originalVideo.localPath, "-to", endTime, "-vf", filterArg, "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", newFilePath];
        console.log(`[FFmpeg TrimBurn] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args);
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
    srtContent: string,
    burnOpts: SubtitleStyleConfig,
    inheritSrtContent?: string
) {
    ensureSubtitleFilterSupport();
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_cropcap_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);
    // Crop dimensions ARE the output dimensions — no probing needed
    const tmpAssPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.ass`);
    fs.writeFileSync(tmpAssPath, buildAssFile(srtContent, burnOpts, { width: w, height: h }), "utf-8");

    try {
        const filterArg = `crop=${w}:${h}:${x}:${y},${buildSubtitlesFilter(tmpAssPath)}`;
        const args = ["-y", "-i", originalVideo.localPath, "-vf", filterArg, "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", newFilePath];
        console.log(`[FFmpeg CropBurn] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args);
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
    srtContent: string,
    burnOpts: SubtitleStyleConfig,
    inheritSrtContent?: string
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
    fs.writeFileSync(tmpAssPath, buildAssFile(srtContent, burnOpts, { width: w, height: h }), "utf-8");

    try {
        const filterArg = `crop=${w}:${h}:${x}:${y},${buildSubtitlesFilter(tmpAssPath)}`;
        const args = ["-y", "-ss", startTime, "-i", originalVideo.localPath, "-to", endTime, "-vf", filterArg, "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", newFilePath];
        console.log(`[FFmpeg TrimCropBurn] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args);
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
    srtContent: string,
    burnOpts: SubtitleStyleConfig,
    inheritSrtContent?: string
) {
    ensureSubtitleFilterSupport();

    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_captioned_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    const vDim = await getVideoDimensions(originalVideo.localPath);
    const tmpAssPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.ass`);
    fs.writeFileSync(tmpAssPath, buildAssFile(srtContent, burnOpts, vDim), "utf-8");

    try {
        const filterArg = buildSubtitlesFilter(tmpAssPath);
        const args = ["-y", "-i", originalVideo.localPath, "-vf", filterArg, "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", newFilePath];
        console.log(`[FFmpeg BurnSubs] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args);
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
