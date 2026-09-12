import { spawn } from "child_process";
import path from "path";
import { appDataPath } from "@/lib/app-paths";
import fs from "fs";
import { getFfmpegPath } from "@/lib/ffmpeg";

// Thumbnails directory within the project
/**
 * Generated thumbnails.
 *
 * Was `<cwd>/thumbnails`, which in the packaged app is inside the .app bundle,
 * so every thumbnail was deleted by each update and the library came back as a
 * wall of blank cards until each one was regenerated. Same defect as the one
 * that destroyed downloaded media and transcripts.
 */
const thumbnailsDir = appDataPath("thumbnails");
if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
}

/**
 * Generate a thumbnail for a video file using ffmpeg.
 * Captures a frame at 1 second, scaled to 480px wide, saved as .webp
 */
export function generateVideoThumbnail(videoPath: string, videoId: string): Promise<string | null> {
    return new Promise((resolve) => {
        const webpPath = path.join(thumbnailsDir, `${videoId}.webp`);
        const jpgPath = path.join(thumbnailsDir, `${videoId}.jpg`);

        // If thumbnail already exists, return it
        if (fs.existsSync(webpPath)) {
            return resolve(webpPath);
        }
        if (fs.existsSync(jpgPath)) {
            return resolve(jpgPath);
        }

        // Verify video file exists
        if (!fs.existsSync(videoPath)) {
            console.error(`Video file not found for thumbnail: ${videoPath}`);
            return resolve(null);
        }

        const ffmpeg = spawn(getFfmpegPath(), [
            "-y",           // Overwrite
            "-ss", "1",     // Seek to 1 second
            "-i", videoPath,
            "-vframes", "1",
            "-vf", "scale=480:-1",
            "-f", "webp",
            "-quality", "80",
            webpPath,
        ]);

        let stderr = "";
        ffmpeg.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        ffmpeg.on("close", (code) => {
            if (code === 0 && fs.existsSync(webpPath)) {
                resolve(webpPath);
                return;
            }

            // Fallback for ffmpeg builds without libwebp support.
            const ffmpegJpg = spawn(getFfmpegPath(), [
                "-y",
                "-ss", "1",
                "-i", videoPath,
                "-vframes", "1",
                "-vf", "scale=480:-1",
                "-q:v", "4",
                jpgPath,
            ]);
            let jpgErr = "";
            ffmpegJpg.stderr.on("data", (d) => {
                jpgErr += d.toString();
            });
            ffmpegJpg.on("close", (jpgCode) => {
                if (jpgCode === 0 && fs.existsSync(jpgPath)) {
                    resolve(jpgPath);
                } else {
                    console.error(`ffmpeg thumbnail generation failed (webp=${code}, jpg=${jpgCode}): ${stderr.slice(-300)} ${jpgErr.slice(-300)}`);
                    resolve(null);
                }
            });
        });

        ffmpeg.on("error", (err) => {
            console.error("ffmpeg spawn error:", err);
            resolve(null);
        });
    });
}

/**
 * Generate a thumbnail for an image file.
 * Uses ffmpeg to resize to 480px wide and save as .webp
 */
export function generateImageThumbnail(imagePath: string, videoId: string): Promise<string | null> {
    return new Promise((resolve) => {
        const webpPath = path.join(thumbnailsDir, `${videoId}.webp`);
        const jpgPath = path.join(thumbnailsDir, `${videoId}.jpg`);

        if (fs.existsSync(webpPath)) {
            return resolve(webpPath);
        }
        if (fs.existsSync(jpgPath)) {
            return resolve(jpgPath);
        }

        if (!fs.existsSync(imagePath)) {
            console.error(`Image file not found for thumbnail: ${imagePath}`);
            return resolve(null);
        }

        const ffmpeg = spawn(getFfmpegPath(), [
            "-y",
            "-i", imagePath,
            "-vf", "scale=480:-1",
            "-f", "webp",
            "-quality", "80",
            webpPath,
        ]);

        let stderr = "";
        ffmpeg.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        ffmpeg.on("close", (code) => {
            if (code === 0 && fs.existsSync(webpPath)) {
                resolve(webpPath);
                return;
            }

            const ffmpegJpg = spawn(getFfmpegPath(), [
                "-y",
                "-i", imagePath,
                "-vf", "scale=480:-1",
                "-q:v", "4",
                jpgPath,
            ]);
            let jpgErr = "";
            ffmpegJpg.stderr.on("data", (d) => {
                jpgErr += d.toString();
            });
            ffmpegJpg.on("close", (jpgCode) => {
                if (jpgCode === 0 && fs.existsSync(jpgPath)) {
                    resolve(jpgPath);
                } else {
                    console.error(`ffmpeg image thumbnail failed (webp=${code}, jpg=${jpgCode}): ${stderr.slice(-300)} ${jpgErr.slice(-300)}`);
                    resolve(null);
                }
            });
        });

        ffmpeg.on("error", (err) => {
            console.error("ffmpeg spawn error:", err);
            resolve(null);
        });
    });
}

/**
 * Generate a thumbnail for any media file based on type.
 */
export async function generateThumbnail(filePath: string, videoId: string, mediaType: string): Promise<string | null> {
    if (mediaType === "image") {
        return generateImageThumbnail(filePath, videoId);
    }
    return generateVideoThumbnail(filePath, videoId);
}

export function getThumbnailsDir() {
    return thumbnailsDir;
}
