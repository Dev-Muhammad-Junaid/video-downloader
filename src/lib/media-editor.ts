import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { generateThumbnail } from "@/lib/thumbnail";

// Helper to spawn ffmpeg and return a promise
function runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", args);
        
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
 * Build FFmpeg force_style string for a given subtitle style preset.
 * These map to ASS/SSA style overrides used by FFmpeg's subtitles filter.
 */
function getForceStyle(stylePreset: string): string {
    switch (stylePreset) {
        case "classic":
            return "FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=40,Alignment=2";
        case "tiktok":
            return "FontName=Impact,FontSize=28,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,Bold=1,BorderStyle=1,Outline=3,Shadow=2,MarginV=120,Alignment=2";
        case "box":
            return "FontName=Arial,FontSize=22,PrimaryColour=&H00000000,OutlineColour=&H00FFFFFF,BackColour=&H00FFFFFF,BorderStyle=4,Outline=0,Shadow=0,MarginV=40,Alignment=2";
        case "cinematic":
            return "FontName=Georgia,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,Italic=1,BorderStyle=1,Outline=0,Shadow=3,MarginV=40,Alignment=2,Spacing=2";
        case "outline":
            return "FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,Bold=1,BorderStyle=1,Outline=2,Shadow=1,MarginV=40,Alignment=2";
        case "bold-center":
            return "FontName=Impact,FontSize=36,PrimaryColour=&H00FFFFFF,OutlineColour=&H60000000,BackColour=&H00000000,Bold=1,BorderStyle=1,Outline=3,Shadow=0,MarginV=10,Alignment=5";
        default:
            return "FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=40,Alignment=2";
    }
}

export async function burnSubtitles(
    videoId: string,
    srtContent: string,
    stylePreset: string = "classic"
) {
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
    const tmpSrtPath = path.join(parsedPath.dir, `_tmp_subs_${newId}.srt`);
    fs.writeFileSync(tmpSrtPath, srtContent, "utf-8");

    try {
        const forceStyle = getForceStyle(stylePreset);
        // Escape special characters in the path for FFmpeg filter syntax
        const escapedSrtPath = tmpSrtPath
            .replace(/\\/g, "\\\\\\\\")
            .replace(/:/g, "\\:")
            .replace(/'/g, "\\'");

        const filterArg = `subtitles='${escapedSrtPath}':force_style='${forceStyle}'`;
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
