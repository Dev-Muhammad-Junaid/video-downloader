import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "@/lib/prisma";
import { generateThumbnail } from "@/lib/thumbnail";
import { ensureFfmpegFilterSupported, getFfmpegPath } from "@/lib/ffmpeg";

// Helper to spawn ffmpeg and return a promise
function runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(getFfmpegPath(), args);
        
        let errorOutput = "";
        ffmpeg.stderr.on("data", (data) => {
            errorOutput += data.toString();
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
    startTime: string, // e.g., "00:00:10" or "10.5"
    endTime: string    // e.g., "00:00:20" or "20.5"
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
            duration: parseFloat(endTime) - parseFloat(startTime),
        }
    });

    // Generate thumbnail
    generateThumbnail(newFilePath, clippedVideo.id, clippedVideo.mediaType).then(async (thumbPath) => {
        if (thumbPath) {
            await prisma.video.update({ where: { id: clippedVideo.id }, data: { thumbnailPath: thumbPath } });
        }
    }).catch(console.error);

    return clippedVideo;
}

export async function cropVideo(
    videoId: string,
    w: number,
    h: number,
    x: number,
    y: number
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

    // Generate thumbnail
    generateThumbnail(newFilePath, croppedVideo.id, croppedVideo.mediaType).then(async (thumbPath) => {
        if (thumbPath) {
            await prisma.video.update({ where: { id: croppedVideo.id }, data: { thumbnailPath: thumbPath } });
        }
    }).catch(console.error);

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
    y: number
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
            duration: parseFloat(endTime) - parseFloat(startTime),
        }
    });

    generateThumbnail(newFilePath, resultVideo.id, resultVideo.mediaType).then(async (thumbPath) => {
        if (thumbPath) {
            await prisma.video.update({ where: { id: resultVideo.id }, data: { thumbnailPath: thumbPath } });
        }
    }).catch(console.error);

    return resultVideo;
}

/**
 * Build FFmpeg force_style string for a given subtitle style preset.
 * fontFamily overrides the preset's default font when provided.
 * Colors are in ASS ABGR format: &HAABBGGRR.
 */
function getForceStyle(stylePreset: string, fontFamily?: string): string {
    const font = fontFamily || "Arial";
    switch (stylePreset) {
        case "classic":
            return `FontName=${font},FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=40,Alignment=2`;
        case "tiktok":
            return `FontName=${font},FontSize=28,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,Bold=1,BorderStyle=1,Outline=3,Shadow=2,MarginV=120,Alignment=2`;
        case "box":
            return `FontName=${font},FontSize=22,PrimaryColour=&H00000000,OutlineColour=&H00FFFFFF,BackColour=&H00FFFFFF,BorderStyle=4,Outline=0,Shadow=0,MarginV=40,Alignment=2`;
        case "cinematic":
            return `FontName=${font},FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,Italic=1,BorderStyle=1,Outline=0,Shadow=3,MarginV=40,Alignment=2,Spacing=2`;
        case "outline":
            return `FontName=${font},FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,Bold=1,BorderStyle=1,Outline=2,Shadow=1,MarginV=40,Alignment=2`;
        case "bold-center":
            return `FontName=${font},FontSize=36,PrimaryColour=&H00FFFFFF,OutlineColour=&H60000000,BackColour=&H00000000,Bold=1,BorderStyle=1,Outline=3,Shadow=0,MarginV=10,Alignment=5`;
        default:
            return `FontName=${font},FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=40,Alignment=2`;
    }
}

/**
 * Escape force_style value for ffmpeg filter syntax.
 * Keep commas intact (valid inside quoted ASS style strings),
 * only escape backslashes and single quotes.
 */
function escapeFfFilterForceStyle(style: string): string {
    return style.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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
            duration: parseFloat(endTime) - parseFloat(startTime),
        }
    });

    return trimmedAudio;
}

export async function trimBurnSubtitles(
    videoId: string,
    startTime: string,
    endTime: string,
    srtContent: string,
    stylePreset: string = "classic",
    fontFamily?: string
) {
    ensureSubtitleFilterSupport();
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_trimcap_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);
    const tmpSrtPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.srt`);
    fs.writeFileSync(tmpSrtPath, srtContent, "utf-8");

    try {
        const forceStyle = escapeFfFilterForceStyle(getForceStyle(stylePreset, fontFamily));
        const escapedSrtPath = tmpSrtPath.replace(/\\/g, "\\\\\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
        const filterArg = `subtitles=filename='${escapedSrtPath}':force_style='${forceStyle}'`;
        const args = ["-y", "-ss", startTime, "-i", originalVideo.localPath, "-to", endTime, "-vf", filterArg, "-c:a", "copy", "-preset", "fast", newFilePath];
        console.log(`[FFmpeg TrimBurn] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args);
    } finally {
        try { fs.unlinkSync(tmpSrtPath); } catch { }
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
            duration: parseFloat(endTime) - parseFloat(startTime),
        }
    });
    generateThumbnail(newFilePath, resultVideo.id, resultVideo.mediaType).then(async (tp) => { if (tp) await prisma.video.update({ where: { id: resultVideo.id }, data: { thumbnailPath: tp } }); }).catch(console.error);
    return resultVideo;
}

export async function cropBurnSubtitles(
    videoId: string,
    w: number, h: number, x: number, y: number,
    srtContent: string,
    stylePreset: string = "classic",
    fontFamily?: string
) {
    ensureSubtitleFilterSupport();
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_cropcap_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);
    const tmpSrtPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.srt`);
    fs.writeFileSync(tmpSrtPath, srtContent, "utf-8");

    try {
        const forceStyle = escapeFfFilterForceStyle(getForceStyle(stylePreset, fontFamily));
        const escapedSrtPath = tmpSrtPath.replace(/\\/g, "\\\\\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
        const filterArg = `crop=${w}:${h}:${x}:${y},subtitles=filename='${escapedSrtPath}':force_style='${forceStyle}'`;
        const args = ["-y", "-i", originalVideo.localPath, "-vf", filterArg, "-c:a", "copy", "-preset", "fast", newFilePath];
        console.log(`[FFmpeg CropBurn] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args);
    } finally {
        try { fs.unlinkSync(tmpSrtPath); } catch { }
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
    return resultVideo;
}

export async function trimCropBurnSubtitles(
    videoId: string,
    startTime: string, endTime: string,
    w: number, h: number, x: number, y: number,
    srtContent: string,
    stylePreset: string = "classic",
    fontFamily?: string
) {
    ensureSubtitleFilterSupport();
    const originalVideo = await prisma.video.findUnique({ where: { id: videoId } });
    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_trimcropcap_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);
    const tmpSrtPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.srt`);
    fs.writeFileSync(tmpSrtPath, srtContent, "utf-8");

    try {
        const forceStyle = escapeFfFilterForceStyle(getForceStyle(stylePreset, fontFamily));
        const escapedSrtPath = tmpSrtPath.replace(/\\/g, "\\\\\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
        const filterArg = `crop=${w}:${h}:${x}:${y},subtitles=filename='${escapedSrtPath}':force_style='${forceStyle}'`;
        const args = ["-y", "-ss", startTime, "-i", originalVideo.localPath, "-to", endTime, "-vf", filterArg, "-c:a", "copy", "-preset", "fast", newFilePath];
        console.log(`[FFmpeg TrimCropBurn] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args);
    } finally {
        try { fs.unlinkSync(tmpSrtPath); } catch { }
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
            duration: parseFloat(endTime) - parseFloat(startTime),
        }
    });
    generateThumbnail(newFilePath, resultVideo.id, resultVideo.mediaType).then(async (tp) => { if (tp) await prisma.video.update({ where: { id: resultVideo.id }, data: { thumbnailPath: tp } }); }).catch(console.error);
    return resultVideo;
}

export async function burnSubtitles(
    videoId: string,
    srtContent: string,
    stylePreset: string = "classic",
    fontFamily?: string
) {
    ensureSubtitleFilterSupport();

    const originalVideo = await prisma.video.findUnique({
        where: { id: videoId }
    });

    if (!originalVideo) throw new Error("Video not found");
    if (!fs.existsSync(originalVideo.localPath)) throw new Error("Original file missing on disk");

    const parsedPath = path.parse(originalVideo.localPath);
    const newId = Math.random().toString(36).substring(2, 15);
    const newFileName = `${parsedPath.name}_captioned_${newId}${parsedPath.ext}`;
    const newFilePath = path.join(parsedPath.dir, newFileName);

    // Write temp SRT file (FFmpeg's subtitles filter needs a file path)
    // Use system temp directory to avoid write-permission issues in source folders.
    const tmpSrtPath = path.join(os.tmpdir(), `_tmp_subs_${newId}.srt`);
    fs.writeFileSync(tmpSrtPath, srtContent, "utf-8");

    try {
        const forceStyleRaw = getForceStyle(stylePreset, fontFamily);
        const forceStyle = escapeFfFilterForceStyle(forceStyleRaw);
        // Escape special characters in the path for FFmpeg filter syntax
        const escapedSrtPath = tmpSrtPath
            .replace(/\\/g, "\\\\\\\\")
            .replace(/:/g, "\\:")
            .replace(/'/g, "\\'");

        // Use explicit filename= form to avoid parser ambiguity on absolute paths.
        const filterArg = `subtitles=filename='${escapedSrtPath}':force_style='${forceStyle}'`;
        const args = [
            "-y",
            "-i", originalVideo.localPath,
            "-vf", filterArg,
            "-c:a", "copy",     // Copy audio
            "-preset", "fast",  // Faster encoding
            newFilePath
        ];

        console.log(`[FFmpeg BurnSubs] Running: ffmpeg ${args.join(" ")}`);
        await runFfmpeg(args);
    } finally {
        // Clean up temp SRT regardless of success/failure
        try { fs.unlinkSync(tmpSrtPath); } catch { }
    }

    let fileSize = 0;
    try {
        const stats = fs.statSync(newFilePath);
        fileSize = stats.size;
    } catch (e) { }

    // Create a new DB entry for the captioned video
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

    // Generate thumbnail
    generateThumbnail(newFilePath, captionedVideo.id, captionedVideo.mediaType).then(async (thumbPath) => {
        if (thumbPath) {
            await prisma.video.update({ where: { id: captionedVideo.id }, data: { thumbnailPath: thumbPath } });
        }
    }).catch(console.error);

    return captionedVideo;
}
