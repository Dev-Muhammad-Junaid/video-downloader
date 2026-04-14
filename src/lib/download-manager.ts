import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import https from "https";
import http from "http";
import { prisma } from "@/lib/prisma";
import { generateThumbnail } from "@/lib/thumbnail";
import { getMatchingProfile, getYtDlpFormat } from "./profiles";
import { uploadToCloud } from "./cloud";
import pLimit from "p-limit";
import { getFfmpegPath } from "@/lib/ffmpeg";

export type DownloadStatus = "pending" | "queued" | "downloading" | "processing" | "paused" | "completed" | "error" | "cancelled";
export type DuplicatePolicy = "skip" | "replace" | "keep-both";
export type QualityPreset = "best" | "balanced" | "data-saver" | "audio";

export interface DownloadJob {
    id: string;
    url: string;
    title: string;
    status: DownloadStatus;
    progress: number; // 0 to 100
    downloadPath?: string;
    error?: string;
    completedAt?: number; // timestamp for auto-cleanup
}

const globalForDownloads = global as unknown as { 
    activeDownloads: Map<string, DownloadJob>;
    cleanupIntervalId?: NodeJS.Timeout;
    downloadQueue?: ReturnType<typeof pLimit>;
    jobProcesses?: Map<string, ReturnType<typeof spawn>>;
    jobAbortControllers?: Map<string, AbortController>;
};
export const activeDownloads = globalForDownloads.activeDownloads || new Map<string, DownloadJob>();
if (process.env.NODE_ENV !== "production") globalForDownloads.activeDownloads = activeDownloads;

// Queue to limit concurrent downloads
const limit = globalForDownloads.downloadQueue || pLimit(3);
if (process.env.NODE_ENV !== "production") globalForDownloads.downloadQueue = limit;
const jobProcesses = globalForDownloads.jobProcesses || new Map<string, ReturnType<typeof spawn>>();
const jobAbortControllers = globalForDownloads.jobAbortControllers || new Map<string, AbortController>();
if (process.env.NODE_ENV !== "production") {
    globalForDownloads.jobProcesses = jobProcesses;
    globalForDownloads.jobAbortControllers = jobAbortControllers;
}

// Auto-cleanup: sweep completed/error jobs older than 10 minutes every 5 minutes
const CLEANUP_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

if (globalForDownloads.cleanupIntervalId) {
    clearInterval(globalForDownloads.cleanupIntervalId);
}

globalForDownloads.cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [id, job] of activeDownloads) {
        if ((job.status === "completed" || job.status === "error") && job.completedAt && (now - job.completedAt > CLEANUP_MAX_AGE_MS)) {
            activeDownloads.delete(id);
        }
    }
}, CLEANUP_INTERVAL_MS);


// Ensure downloads directory exists — read configurable destination
const settingsPath = path.join(process.cwd(), "download_destination");
let downloadsDir = path.join(process.cwd(), "downloads"); // default
try {
    if (fs.existsSync(settingsPath)) {
        const customDir = fs.readFileSync(settingsPath, "utf-8").trim();
        if (customDir && fs.existsSync(customDir)) {
            downloadsDir = customDir;
        }
    }
} catch { }
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

export function getDownloadsDir() {
    return downloadsDir;
}

export function setDownloadsDir(newDir: string) {
    downloadsDir = newDir;
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }
    // Persist to file
    fs.writeFileSync(settingsPath, newDir, "utf-8");
}

const GALLERY_DL_PATH = path.join(os.homedir(), ".local", "bin", "gallery-dl");

export function getJob(id: string) {
    return activeDownloads.get(id);
}

async function persistJob(job: DownloadJob, extra?: Partial<{
    sourcePlatform: string;
    mediaType: string;
    imageUrl: string;
    formatId: string;
    qualityPreset: string;
    duplicatePolicy: string;
}>) {
    try {
        await prisma.downloadQueueJob.upsert({
            where: { id: job.id },
            create: {
                id: job.id,
                url: job.url,
                title: job.title,
                sourcePlatform: extra?.sourcePlatform ?? "unknown",
                mediaType: extra?.mediaType ?? "video",
                imageUrl: extra?.imageUrl,
                formatId: extra?.formatId,
                qualityPreset: extra?.qualityPreset,
                duplicatePolicy: extra?.duplicatePolicy ?? "keep-both",
                status: job.status,
                progress: job.progress,
                downloadPath: job.downloadPath,
                error: job.error ?? null,
                completedAt: job.completedAt ? new Date(job.completedAt) : null,
            },
            update: {
                status: job.status,
                progress: job.progress,
                downloadPath: job.downloadPath,
                error: job.error ?? null,
                completedAt: job.completedAt ? new Date(job.completedAt) : null,
                ...(extra?.sourcePlatform ? { sourcePlatform: extra.sourcePlatform } : {}),
                ...(extra?.mediaType ? { mediaType: extra.mediaType } : {}),
                ...(extra?.imageUrl ? { imageUrl: extra.imageUrl } : {}),
                ...(extra?.formatId ? { formatId: extra.formatId } : {}),
                ...(extra?.qualityPreset ? { qualityPreset: extra.qualityPreset } : {}),
                ...(extra?.duplicatePolicy ? { duplicatePolicy: extra.duplicatePolicy } : {}),
            },
        });
    } catch (error) {
        console.error("[Queue] Failed persisting job", error);
    }
}

export async function getAllJobs() {
    const persisted = await prisma.downloadQueueJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    return persisted.map((job) => ({
        id: job.id,
        url: job.url,
        title: job.title,
        status: job.status as DownloadStatus,
        progress: job.progress,
        imageUrl: job.imageUrl ?? undefined,
        downloadPath: job.downloadPath ?? undefined,
        error: job.error ?? undefined,
        completedAt: job.completedAt ? job.completedAt.getTime() : undefined,
    }));
}

export async function clearCompletedJobs() {
    for (const [id, job] of activeDownloads) {
        if (job.status === "completed" || job.status === "error" || job.status === "cancelled") {
            activeDownloads.delete(id);
        }
    }
    await prisma.downloadQueueJob.deleteMany({
        where: { status: { in: ["completed", "error", "cancelled"] } },
    });
}

export async function clearAllJobs() {
    for (const [id, job] of activeDownloads) {
        if (job.status === "downloading" || job.status === "processing" || job.status === "queued" || job.status === "paused") {
            await cancelJob(id);
        }
        activeDownloads.delete(id);
    }
    await prisma.downloadQueueJob.deleteMany();
}

export async function getJobById(id: string) {
    const live = activeDownloads.get(id);
    if (live) return live;
    const persisted = await prisma.downloadQueueJob.findUnique({ where: { id } });
    if (!persisted) return null;
    return {
        id: persisted.id,
        url: persisted.url,
        title: persisted.title,
        status: persisted.status as DownloadStatus,
        progress: persisted.progress,
        downloadPath: persisted.downloadPath ?? undefined,
        error: persisted.error ?? undefined,
        completedAt: persisted.completedAt ? persisted.completedAt.getTime() : undefined,
    } satisfies DownloadJob;
}

export async function pauseJob(id: string) {
    const proc = jobProcesses.get(id);
    const job = activeDownloads.get(id);
    if (!proc || !job) throw new Error("Active job not found");
    process.kill(proc.pid!, "SIGSTOP");
    job.status = "paused";
    activeDownloads.set(id, job);
    await persistJob(job);
}

export async function resumeJob(id: string) {
    const proc = jobProcesses.get(id);
    const job = activeDownloads.get(id);
    if (!proc || !job) throw new Error("Paused job not found");
    process.kill(proc.pid!, "SIGCONT");
    job.status = "downloading";
    activeDownloads.set(id, job);
    await persistJob(job);
}

export async function cancelJob(id: string) {
    const proc = jobProcesses.get(id);
    if (proc && proc.pid) {
        process.kill(proc.pid, "SIGTERM");
        jobProcesses.delete(id);
    }
    const controller = jobAbortControllers.get(id);
    if (controller) {
        controller.abort();
        jobAbortControllers.delete(id);
    }
    const job = activeDownloads.get(id);
    if (job) {
        job.status = "cancelled";
        job.error = "Cancelled by user";
        job.completedAt = Date.now();
        activeDownloads.set(id, job);
        await persistJob(job);
    } else {
        await prisma.downloadQueueJob.updateMany({
            where: { id },
            data: {
                status: "cancelled",
                error: "Cancelled by user",
                completedAt: new Date(),
            },
        });
    }
}

// Generalized Taxonomy Dictionary
const taxonomy: Record<string, string[]> = {
    "Politics": ["biden", "trump", "election", "government", "congress", "parliament", "senate", "president", "political", "democrat", "republican", "policy", "vote"],
    "Conflict & War": ["war", "conflict", "military", "army", "missile", "bomb", "iran", "gaza", "israel", "palestine", "ukraine", "russia", "combat", "soldier", "troops", "strike", "hamas", "idf"],
    "Entertainment": ["movie", "music", "song", "comedy", "funny", "meme", "entertainment", "gaming", "gameplay", "streamer", "twitch", "joke", "prank", "dance", "tiktok", "viral"],
    "Sports": ["football", "basketball", "soccer", "sports", "athlete", "tournament", "match", "nfl", "nba", "fifa", "champion", "olympics"],
    "Technology": ["tech", "software", "ai", "coding", "programming", "computer", "phone", "review", "apple", "google", "microsoft", "hardware", "gadget", "cyber"],
    "News & Report": ["news", "breaking", "update", "report", "journalism", "interview", "journalist", "media", "press"],
    "Education": ["tutorial", "how to", "learn", "education", "science", "history", "documentary", "study", "lecture", "explain"],
    "Finance": ["crypto", "finance", "money", "stock", "trading", "invest", "economy", "bitcoin", "wealth", "business", "market", "wall street"]
};

function scoreTaxonomy(text: string): string[] {
    const lower = text.toLowerCase();
    const scores: Record<string, number> = {};

    for (const [category, keywords] of Object.entries(taxonomy)) {
        scores[category] = 0;
        for (const keyword of keywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const match = lower.match(regex);
            if (match) {
                scores[category] += match.length;
            }
        }
    }

    return Object.entries(scores)
        .filter(([_, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(c => c[0]);
}

async function applyDuplicatePolicy(originalUrl: string | undefined, policy: DuplicatePolicy) {
    if (!originalUrl) return { duplicate: null as any, skipped: false };
    const duplicate = await prisma.video.findFirst({ where: { originalUrl } });
    if (!duplicate) return { duplicate: null as any, skipped: false };
    if (policy === "skip") {
        return { duplicate, skipped: true };
    }
    if (policy === "replace") {
        try {
            if (duplicate.localPath && fs.existsSync(duplicate.localPath)) {
                fs.unlinkSync(duplicate.localPath);
            }
        } catch (error) {
            console.warn("[Queue] Could not remove duplicate local file", error);
        }
        await prisma.video.delete({ where: { id: duplicate.id } });
    }
    return { duplicate, skipped: false };
}

async function downloadFile(url: string, dest: string, jobId?: string): Promise<void> {
    const controller = new AbortController();
    if (jobId) {
        jobAbortControllers.set(jobId, controller);
    }
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
        const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        if (!response.body) throw new Error('No body in response');

        const fileStream = fs.createWriteStream(dest);
        // @ts-ignore
        const readable = require("stream").Readable.fromWeb(response.body);
        
        await new Promise<void>((resolve, reject) => {
            readable.pipe(fileStream);
            fileStream.on("finish", () => resolve());
            fileStream.on("error", reject);
            readable.on("error", reject);
        });
    } catch (err) {
        fs.unlink(dest, () => { });
        throw err;
    } finally {
        if (jobId) {
            jobAbortControllers.delete(jobId);
        }
        clearTimeout(timeout);
    }
}

export async function startDownload(
    url: string,
    title: string,
    sourcePlatform: string,
    mediaType: string = "video",
    imageUrl?: string,
    formatId?: string,
    forceCloudSync: boolean = false,
    duplicatePolicy: DuplicatePolicy = "keep-both",
    qualityPreset: QualityPreset = "best",
    profileId?: string,
    existingJobId?: string,
) {
    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error("Invalid URL protocol");
        }
    } catch {
        throw new Error("Invalid or unsafe URL provided");
    }

    const id = existingJobId || Math.random().toString(36).substring(2, 15);
    const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const duplicateState = await applyDuplicatePolicy(url, duplicatePolicy);

    const current = activeDownloads.get(id);
    if (current && ["queued", "downloading", "processing", "paused"].includes(current.status)) {
        throw new Error("This queue item is already active");
    }

    const job: DownloadJob = {
        id,
        url,
        title,
        status: "queued",
        progress: 0,
        error: undefined,
        completedAt: undefined,
    };

    activeDownloads.set(id, job);
    await persistJob(job, {
        sourcePlatform,
        mediaType,
        imageUrl,
        formatId,
        qualityPreset,
        duplicatePolicy,
        ...(profileId ? { qualityPreset: `profile:${profileId}` } : {}),
    });

    if (duplicateState.skipped) {
        job.status = "completed";
        job.error = "Skipped duplicate URL (policy: skip)";
        job.completedAt = Date.now();
        activeDownloads.set(id, job);
        await persistJob(job);
        return job;
    }

    const startTime = Date.now();

    if (mediaType === "image" && imageUrl) {
        // Queue the image download process
        limit(async () => {
            const ext = path.extname(new URL(imageUrl).pathname) || ".jpg";
            const fileName = `${safeTitle}_${id}${ext}`;
            const outputPath = path.join(downloadsDir, fileName);

            try {
                // Create download log entry
                job.status = "downloading";
                activeDownloads.set(id, job);
                await persistJob(job);
                const logEntry = await prisma.downloadLog.create({
                    data: { url, title, sourcePlatform, status: "downloading" },
                });

            await downloadFile(imageUrl, outputPath, id);

            job.status = "completed";
            job.completedAt = Date.now();
            job.progress = 100;
            job.downloadPath = outputPath;
            activeDownloads.set(id, job);
            await persistJob(job);

            let fileSize = 0;
            try {
                const stats = fs.statSync(outputPath);
                fileSize = stats.size;
            } catch (e) { }

            // DB insert
            const allTags = new Set<string>();
            if (duplicateState.duplicate) allTags.add("Duplicate");

            // Score title for taxonomy
            const topCategories = scoreTaxonomy(title);
            topCategories.forEach(c => allTags.add(c));

            const finalTags = Array.from(allTags);
            const dbData: any = {
                title,
                originalUrl: url,
                sourcePlatform,
                localPath: outputPath,
                fileSize,
                mediaType: "image",
            };

            if (finalTags.length > 0) {
                dbData.labels = {
                    connectOrCreate: finalTags.map(tag => ({
                        where: { name: tag },
                        create: { name: tag, color: "bg-sage-600/30 text-sage-foreground font-medium border-sage-500/30" }
                    }))
                };
            }

            const createdVideo = await prisma.video.create({ data: dbData });

            if (forceCloudSync) {
                uploadToCloud(createdVideo.id).catch(err => {
                    console.error(`[AutoSync] Error uploading image ${createdVideo.id}:`, err);
                });
            }

            // Update download log
            await prisma.downloadLog.update({
                where: { id: logEntry.id },
                data: {
                    status: "completed",
                    videoId: createdVideo.id,
                    fileSize,
                    duration: (Date.now() - startTime) / 1000,
                    completedAt: new Date(),
                },
            });

            // Generate thumbnail in background
            generateThumbnail(outputPath, createdVideo.id, "image").then(async (thumbPath) => {
                if (thumbPath) {
                    await prisma.video.update({ where: { id: createdVideo.id }, data: { thumbnailPath: thumbPath } });
                }
            }).catch(console.error);
        } catch (err: any) {
            job.status = "error";
            job.completedAt = Date.now();
            job.error = err.message || "Image download failed";
            activeDownloads.set(id, job);
            await persistJob(job);
            console.error("Image download failed:", err);

            // Log failure
            try {
                await prisma.downloadLog.updateMany({
                    where: { url, status: "downloading" },
                    data: {
                        status: "error",
                        errorMessage: err.message || "Image download failed",
                        duration: (Date.now() - startTime) / 1000,
                        completedAt: new Date(),
                    },
                });
            } catch { }
        }
        }); // End limit()
        return job;
    }

    // Queue the video download process
    limit(async () => {
        let logId = "";
        try {
            job.status = "downloading";
            activeDownloads.set(id, job);
            await persistJob(job);
            // Build yt-dlp args based on profile & format selection
            const selectedProfile = profileId ? await prisma.downloadProfile.findUnique({ where: { id: profileId } }) : null;
            const profile = selectedProfile || await getMatchingProfile(url);
            const { args: formatArgs, isAudio } = getYtDlpFormat(profile || { maxResolution: "best", preferredFormat: "mp4" }, formatId);
            
            const fileName = isAudio ? `${safeTitle}_${id}.mp3` : `${safeTitle}_${id}.mp4`;
            const outputPath = path.join(downloadsDir, fileName);

            // Create download log entry
            const log = await prisma.downloadLog.create({
                data: { url, title, sourcePlatform, status: "downloading" },
            });
            logId = log.id;

        const ytdlpArgs: string[] = [];
        
        // Check if we need to target a specific item index from our custom parameter
        try {
            const parsedUrl = new URL(url);
            const playlistItem = parsedUrl.searchParams.get("snapdown_playlist_item");
            if (playlistItem) {
                ytdlpArgs.push("-I", playlistItem);
                parsedUrl.searchParams.delete("snapdown_playlist_item");
                url = parsedUrl.toString();
            }
        } catch { }

        ytdlpArgs.push(...formatArgs);
        ytdlpArgs.push("--ffmpeg-location", getFfmpegPath());
        ytdlpArgs.push("-o", outputPath, "--write-info-json", "--newline", url);

        console.log(`[Download] Starting yt-dlp with args:`, ytdlpArgs.join(" "));
        const ytdlp = spawn("yt-dlp", ytdlpArgs);
        jobProcesses.set(id, ytdlp);

    ytdlp.stdout.on("data", (data) => {
        const output = data.toString();
        const parts = output.split(/[\r\n]+/);

        for (const part of parts) {
            const progressMatch = part.match(/\[download\]\s+(\d+\.\d+)%/);
            if (progressMatch && progressMatch[1]) {
                const p = parseFloat(progressMatch[1]);
                if (!isNaN(p)) {
                    job.progress = p;
                }
            }
            if (part.includes("[Merger]")) {
                job.status = "processing";
                job.progress = 100;
            }
        }
        activeDownloads.set(id, job);
    });

    ytdlp.stderr.on("data", (data) => {
        const output = data.toString();
        const parts = output.split(/[\r\n]+/);

        for (const part of parts) {
            const progressMatch = part.match(/\[download\]\s+(\d+\.\d+)%/);
            if (progressMatch && progressMatch[1]) {
                const p = parseFloat(progressMatch[1]);
                if (!isNaN(p)) {
                    job.progress = p;
                }
            }
        }
        activeDownloads.set(id, job);
    });

    ytdlp.on("close", async (code, signal) => {
        // If user cancelled the job, keep cancelled state and ignore process exit noise.
        if (job.status === "cancelled") {
            jobProcesses.delete(id);
            return;
        }
        if (code === 0) {
            job.status = "completed";
            job.completedAt = Date.now();
            job.progress = 100;
            job.downloadPath = outputPath;
            activeDownloads.set(id, job);
            await persistJob(job);
            jobProcesses.delete(id);

            let fileSize = 0;
            try {
                const stats = fs.statSync(outputPath);
                fileSize = stats.size;
            } catch (e) { }

            try {
                const dbData: any = {
                    title,
                    originalUrl: url,
                    sourcePlatform,
                    localPath: outputPath,
                    fileSize,
                    mediaType: "video",
                };

                const allTags = new Set<string>();
                if (duplicateState.duplicate) allTags.add("Duplicate");

                // Read info JSON for taxonomy scoring
                const ext = isAudio ? ".mp3" : ".mp4";
                const infoJsonPath = outputPath.replace(ext, '.info.json');
                try {
                    if (fs.existsSync(infoJsonPath)) {
                        const infoContent = fs.readFileSync(infoJsonPath, 'utf8');
                        const info = JSON.parse(infoContent);
                        const textToParse = `${info.title || ''} ${info.description || ''} ${(info.tags || []).join(' ')}`;
                        const topCategories = scoreTaxonomy(textToParse);
                        topCategories.forEach(c => allTags.add(c));
                        fs.unlinkSync(infoJsonPath);
                    }
                } catch (jsonErr) {
                    console.error("Failed to parse yt-dlp info JSON:", jsonErr);
                }

                const finalTags = Array.from(allTags);
                if (finalTags.length > 0) {
                    dbData.labels = {
                        connectOrCreate: finalTags.map(tag => ({
                            where: { name: tag },
                            create: { name: tag, color: "bg-sage-600/30 text-sage-foreground font-medium border-sage-500/30" }
                        }))
                    };
                }

                const createdVideo = await prisma.video.create({ 
                    data: dbData,
                    include: { labels: true } 
                });

                // Update download log
                if (logId) {
                    await prisma.downloadLog.update({
                        where: { id: logId },
                        data: {
                            status: "completed",
                            videoId: createdVideo.id,
                            fileSize,
                            duration: (Date.now() - startTime) / 1000,
                            completedAt: new Date(),
                        },
                    });
                }

                // Check for Auto Cloud Sync (WID-306) or Extension Force (WID-315)
                const shouldAutoSync = forceCloudSync || profile?.autoCloudSync || (createdVideo.labels as any[]).some(l => l.autoCloudSync);
                console.log(`[WID-315 Debug] forceCloudSync: ${forceCloudSync}, shouldAutoSync: ${shouldAutoSync}`);
                if (shouldAutoSync) {
                    console.log(`[WID-315 Debug] Firing uploadToCloud(${createdVideo.id})`);
                    uploadToCloud(createdVideo.id).catch(err => {
                        console.error(`[AutoSync] Error uploading ${createdVideo.id}:`, err);
                    });
                }

                // Generate thumbnail in background
                generateThumbnail(outputPath, createdVideo.id, "video").then(async (thumbPath) => {
                    if (thumbPath) {
                        await prisma.video.update({ where: { id: createdVideo.id }, data: { thumbnailPath: thumbPath } });
                    }
                }).catch(console.error);
            } catch (err) {
                console.error("Failed to insert completed video into DB:", err);
            }
        } else {
            job.status = "error";
            job.completedAt = Date.now();
            if (signal === "SIGTERM") {
                job.status = "cancelled";
                job.error = "Cancelled by user";
            } else {
                job.error = `Process exited with code ${code}`;
            }
            activeDownloads.set(id, job);
            await persistJob(job);
            jobProcesses.delete(id);

            // Log failure
            if (logId) {
                try {
                    await prisma.downloadLog.update({
                        where: { id: logId },
                        data: {
                            status: job.status === "cancelled" ? "error" : "error",
                            errorMessage: job.error || `Process exited with code ${code}`,
                            duration: (Date.now() - startTime) / 1000,
                            completedAt: new Date(),
                        },
                    });
                } catch { }
            }
        }
    });
        } catch (err: any) {
            console.error("Failed to start video download process:", err);
            job.status = "error";
            job.completedAt = Date.now();
            job.error = err.message || "Failed to start download process";
            activeDownloads.set(id, job);
            await persistJob(job);
            jobProcesses.delete(id);

            if (logId) {
                prisma.downloadLog.update({
                    where: { id: logId },
                    data: {
                        status: "error",
                        errorMessage: err.message || "Failed to start download process",
                        completedAt: new Date(),
                    }
                }).catch(console.error);
            }
        }
    }); // End limit()
    
    return job;
}
