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
    kind?: "download" | "export"; // export jobs resume to "processing", not "downloading"
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
    const resolved = path.resolve(newDir);
    const homeDir = os.homedir();
    if (!resolved.startsWith(homeDir) && !resolved.startsWith("/Volumes")) {
        throw new Error("Download directory must be within your home directory or mounted volumes");
    }
    downloadsDir = resolved;
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, resolved, "utf-8");
}

const GALLERY_DL_PATH = path.join(os.homedir(), ".local", "bin", "gallery-dl");

export function getJob(id: string) {
    return activeDownloads.get(id);
}

async function persistJob(job: DownloadJob, extra?: Partial<{
    sourcePlatform: string;
    mediaType: string;
    imageUrl: string;
    thumbnailUrl: string;
    duration: number;
    formatId: string;
    formatLabel: string;
    profileName: string;
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
                thumbnailUrl: extra?.thumbnailUrl,
                duration: extra?.duration,
                formatId: extra?.formatId,
                formatLabel: extra?.formatLabel,
                profileName: extra?.profileName,
                qualityPreset: extra?.qualityPreset,
                duplicatePolicy: extra?.duplicatePolicy ?? "keep-both",
                status: job.status,
                progress: job.progress,
                downloadPath: job.downloadPath,
                error: job.error ?? null,
                completedAt: job.completedAt ? new Date(job.completedAt) : null,
            },
            update: {
                title: job.title,
                status: job.status,
                progress: job.progress,
                downloadPath: job.downloadPath,
                error: job.error ?? null,
                completedAt: job.completedAt ? new Date(job.completedAt) : null,
                ...(extra?.sourcePlatform ? { sourcePlatform: extra.sourcePlatform } : {}),
                ...(extra?.mediaType ? { mediaType: extra.mediaType } : {}),
                ...(extra?.imageUrl ? { imageUrl: extra.imageUrl } : {}),
                ...(extra?.thumbnailUrl ? { thumbnailUrl: extra.thumbnailUrl } : {}),
                ...(extra?.duration !== undefined ? { duration: extra.duration } : {}),
                ...(extra?.formatId ? { formatId: extra.formatId } : {}),
                ...(extra?.formatLabel ? { formatLabel: extra.formatLabel } : {}),
                ...(extra?.profileName ? { profileName: extra.profileName } : {}),
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
    return persisted.map((job) => {
        const live = activeDownloads.get(job.id);
        return {
            id: job.id,
            kind: (job as { kind?: string }).kind ?? "download",
            url: job.url,
            title: live?.title || job.title,
            status: (live?.status || job.status) as DownloadStatus,
            progress: live?.progress ?? job.progress,
            imageUrl: job.imageUrl ?? undefined,
            thumbnailUrl: job.thumbnailUrl ?? undefined,
            duration: job.duration ?? undefined,
            sourcePlatform: job.sourcePlatform ?? undefined,
            formatLabel: job.formatLabel ?? undefined,
            profileName: job.profileName ?? undefined,
            downloadPath: live?.downloadPath || job.downloadPath || undefined,
            error: live?.error ?? job.error ?? undefined,
            completedAt: live?.completedAt ?? (job.completedAt ? job.completedAt.getTime() : undefined),
        };
    });
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
    // Cancel every running/paused/queued job first (this finalizes their logs).
    for (const [id, job] of activeDownloads) {
        if (job.status === "downloading" || job.status === "processing" || job.status === "queued" || job.status === "paused") {
            await cancelJob(id);
        }
        activeDownloads.delete(id);
    }

    // Any queue rows in "downloading/queued/paused/processing" that don't have an in-memory job
    // (e.g. after a server restart) would leak logs too — mark their logs cancelled before we
    // wipe the queue rows.
    try {
        const staleQueueJobs = await prisma.downloadQueueJob.findMany({
            where: { status: { in: ["downloading", "processing", "queued", "paused"] } },
            select: { url: true },
        });
        const staleUrls = [...new Set(staleQueueJobs.map((j) => j.url).filter(Boolean))];
        if (staleUrls.length > 0) {
            await prisma.downloadLog.updateMany({
                where: {
                    url: { in: staleUrls },
                    status: { in: ["downloading", "processing"] },
                },
                data: {
                    status: "cancelled",
                    errorMessage: "Queue cleared",
                    completedAt: new Date(),
                },
            });
        }
    } catch (err) {
        console.warn("[Queue] Failed to finalize stale logs on clear:", err);
    }

    await prisma.downloadQueueJob.deleteMany();
}

export async function getJobById(id: string) {
    const live = activeDownloads.get(id);
    const persisted = await prisma.downloadQueueJob.findUnique({ where: { id } });
    if (!live && !persisted) return null;
    return {
        id: id,
        url: live?.url || persisted?.url || "",
        title: live?.title || persisted?.title || "",
        status: (live?.status || persisted?.status || "error") as DownloadStatus,
        progress: live?.progress ?? persisted?.progress ?? 0,
        downloadPath: live?.downloadPath || persisted?.downloadPath || undefined,
        error: live?.error ?? persisted?.error ?? undefined,
        completedAt: live?.completedAt ?? (persisted?.completedAt ? persisted.completedAt.getTime() : undefined),
        imageUrl: persisted?.imageUrl ?? undefined,
        thumbnailUrl: persisted?.thumbnailUrl ?? undefined,
        duration: persisted?.duration ?? undefined,
        sourcePlatform: persisted?.sourcePlatform ?? undefined,
    };
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
    // Exports run under the "processing" status; downloads under "downloading".
    job.status = job.kind === "export" ? "processing" : "downloading";
    activeDownloads.set(id, job);
    await persistJob(job);
}

export async function cancelJob(id: string) {
    const proc = jobProcesses.get(id);
    const hadProcess = !!(proc && proc.pid);
    if (hadProcess) {
        process.kill(proc!.pid!, "SIGTERM");
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

    // Finalize any stale download-log entries for this URL that are still "downloading"/"processing".
    // The process "close" handler updates the log if a process was running, but paused/queued jobs
    // never had a running process to close, so their log entries would otherwise stay stuck.
    if (!hadProcess) {
        try {
            const queueJob = await prisma.downloadQueueJob.findUnique({ where: { id } });
            if (queueJob?.url) {
                await prisma.downloadLog.updateMany({
                    where: { url: queueJob.url, status: { in: ["downloading", "processing"] } },
                    data: {
                        status: "cancelled",
                        errorMessage: "Cancelled by user",
                        completedAt: new Date(),
                    },
                });
            }
        } catch (err) {
            console.warn("[Queue] Failed to finalize log on cancel:", err);
        }
    }
}

export async function resumeInterruptedJobs() {
    try {
        const interrupted = await prisma.downloadQueueJob.findMany({
            where: { status: { in: ["queued", "downloading", "processing"] } },
            orderBy: { position: "asc" },
        });
        if (interrupted.length === 0) return 0;
        console.log(`[Queue] Resuming ${interrupted.length} interrupted jobs from DB...`);
        let resumed = 0;
        for (const job of interrupted) {
            const live = activeDownloads.get(job.id);
            if (live && ["queued", "downloading", "processing"].includes(live.status)) continue;
            try {
                await startDownload(
                    job.url,
                    job.title,
                    job.sourcePlatform || "unknown",
                    job.mediaType || "video",
                    job.imageUrl || undefined,
                    job.formatId || undefined,
                    false,
                    "skip",
                    undefined,
                    job.qualityPreset?.startsWith("profile:") ? job.qualityPreset.replace("profile:", "") : undefined,
                    job.id,
                    job.thumbnailUrl || job.imageUrl || undefined,
                    job.duration ?? undefined,
                );
                resumed++;
            } catch (err) {
                console.error(`[Queue] Failed to resume job ${job.id}:`, err);
            }
        }
        return resumed;
    } catch (err) {
        console.error("[Queue] Failed to resume interrupted jobs:", err);
        return 0;
    }
}

export async function reorderJob(jobId: string, newPosition: number) {
    await prisma.downloadQueueJob.update({
        where: { id: jobId },
        data: { position: newPosition },
    });
}

export async function updateJobPositions(orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
        prisma.downloadQueueJob.update({
            where: { id },
            data: { position: index },
        })
    );
    await prisma.$transaction(updates);
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

async function checkAndLabelDuplicate(originalUrl: string | undefined): Promise<boolean> {
    if (!originalUrl) return false;
    const duplicate = await prisma.video.findFirst({ where: { originalUrl } });
    if (!duplicate) return false;

    try {
        let dupLabel = await prisma.label.findUnique({ where: { name: "Duplicate" } });
        if (!dupLabel) {
            dupLabel = await prisma.label.create({ data: { name: "Duplicate", color: "#ef4444" } });
        }
        const existing = await prisma.video.findFirst({
            where: { id: duplicate.id, labels: { some: { id: dupLabel.id } } },
        });
        if (!existing) {
            await prisma.video.update({
                where: { id: duplicate.id },
                data: { labels: { connect: { id: dupLabel.id } } },
            });
            console.log(`[Queue] Labeled existing "${duplicate.title}" as Duplicate (URL already downloaded)`);
        }
    } catch (err) {
        console.warn("[Queue] Failed to label duplicate:", err);
    }

    return true;
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
    _duplicatePolicy: string = "skip",
    qualityPreset: QualityPreset = "best",
    profileId?: string,
    existingJobId?: string,
    thumbnailUrl?: string,
    duration?: number,
    profileName?: string,
    formatLabel?: string,
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
    const isDuplicate = await checkAndLabelDuplicate(url);

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
        thumbnailUrl: thumbnailUrl || imageUrl,
        duration,
        formatId,
        formatLabel,
        profileName,
        qualityPreset,
        duplicatePolicy: "skip",
        ...(profileId ? { qualityPreset: `profile:${profileId}` } : {}),
    });

    // Note: we used to short-circuit here with `job.status = "completed"` when the URL
    // already existed in the library. That prevented the user from re-downloading the
    // same URL with a different format/profile. Now we just label the existing library
    // item (via `checkAndLabelDuplicate` above) and proceed with the new download.
    void isDuplicate;

    const startTime = Date.now();

    if (mediaType === "image" && imageUrl) {
        // Queue the image download process
        limit(async () => {
            // Look up the matching profile so we can apply image format preference + autoCloudSync
            const imageProfile = profileId
                ? await prisma.downloadProfile.findUnique({ where: { id: profileId } })
                : await getMatchingProfile(url);
            const preferredImageFormat = imageProfile?.preferredImageFormat || "original";

            const srcExt = path.extname(new URL(imageUrl).pathname).toLowerCase() || ".jpg";
            const outExt = preferredImageFormat !== "original" ? `.${preferredImageFormat}` : srcExt;
            const fileName = `${safeTitle}_${id}${outExt}`;
            const outputPath = path.join(downloadsDir, fileName);
            let logEntryId = "";

            try {
                // Create download log entry
                job.status = "downloading";
                activeDownloads.set(id, job);
                await persistJob(job);
                const logEntry = await prisma.downloadLog.create({
                    data: { url, title, sourcePlatform, status: "downloading" },
                });
                logEntryId = logEntry.id;

            // Download to a temp path, then convert if needed
            const needsConversion = preferredImageFormat !== "original" && srcExt !== outExt;
            const downloadTarget = needsConversion
                ? path.join(downloadsDir, `${safeTitle}_${id}_tmp${srcExt}`)
                : outputPath;

            await downloadFile(imageUrl, downloadTarget, id);

            if (needsConversion) {
                const sharp = (await import("sharp")).default;
                let pipeline = sharp(downloadTarget);
                if (outExt === ".jpg" || outExt === ".jpeg") pipeline = pipeline.jpeg({ quality: 90 });
                else if (outExt === ".png") pipeline = pipeline.png();
                else if (outExt === ".webp") pipeline = pipeline.webp({ quality: 85 });
                else if (outExt === ".avif") pipeline = pipeline.avif({ quality: 60 });
                await pipeline.toFile(outputPath);
                fs.unlinkSync(downloadTarget);
            }

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
                        create: { name: tag, color: "#64748b" }
                    }))
                };
            }

            const createdVideo = await prisma.video.create({ data: dbData });

            const shouldSync = forceCloudSync || imageProfile?.autoCloudSync;
            if (shouldSync) {
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
            if (logEntryId) {
                try {
                    await prisma.downloadLog.update({
                        where: { id: logEntryId },
                        data: {
                            status: "error",
                            errorMessage: err.message || "Image download failed",
                            duration: (Date.now() - startTime) / 1000,
                            completedAt: new Date(),
                        },
                    });
                } catch { }
            }
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
            const { args: formatArgs, isAudio } = getYtDlpFormat(profile || { maxResolution: "best", preferredFormat: "mp4" }, formatId, mediaType);
            // When the output is audio, the extension follows the profile's audio format
            // (falling back to a legacy audio value in preferredFormat for un-migrated rows).
            const audioFmt = (profile?.audioFormat || (["mp3", "m4a", "wav"].includes((profile?.preferredFormat || "").toLowerCase()) ? profile?.preferredFormat : "mp3") || "mp3").toLowerCase();
            const audioExt = ["m4a", "wav"].includes(audioFmt) ? audioFmt : "mp3";
            const fileName = isAudio ? `${safeTitle}_${id}.${audioExt}` : `${safeTitle}_${id}.mp4`;
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
        ytdlpArgs.push("-o", outputPath, "--write-info-json", "--newline", "--", url);

        console.log(`[Download] Starting yt-dlp with args:`, ytdlpArgs.join(" "));
        const ytdlp = spawn("yt-dlp", ytdlpArgs);
        jobProcesses.set(id, ytdlp);

    ytdlp.on("error", async (err) => {
        job.status = "error";
        job.completedAt = Date.now();
        job.error = `Failed to start yt-dlp: ${err.message}`;
        activeDownloads.set(id, job);
        await persistJob(job);
        jobProcesses.delete(id);
        if (logId) {
            prisma.downloadLog.update({
                where: { id: logId },
                data: { status: "error", errorMessage: job.error, completedAt: new Date() },
            }).catch(console.error);
        }
    });

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
                    mediaType: isAudio ? "audio" : "video",
                };

                const allTags = new Set<string>();

                // Read info JSON for taxonomy scoring
                // Derive the info-json path by swapping the actual output extension
                // (audio may be .mp3 / .m4a / .wav, video is .mp4).
                const infoJsonPath = outputPath.replace(/\.[^.]+$/, '.info.json');
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
                            create: { name: tag, color: "#64748b" }
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
                            status: job.status === "cancelled" ? "cancelled" : "error",
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

// ── Export (local edit/burn) jobs ─────────────────────────────────────────────
//
// Edit/export operations (trim, crop, subtitle burn) reuse the download queue's
// progress plumbing: they get a DownloadQueueJob row with kind="export" plus an
// in-memory activeDownloads entry, so the existing SSE stream and queue UI show
// their ffmpeg progress exactly like a download. They never spawn yt-dlp.

/** Create an export job (status "processing") and return its id. `exportSpec`
 *  is the JSON request so the job can be replayed via Retry. */
export async function createExportJob(opts: { title: string; mediaType?: string; exportSpec?: string }): Promise<string> {
    const id = `export_${Math.random().toString(36).substring(2, 15)}`;
    const job: DownloadJob = {
        id,
        url: "",
        title: opts.title,
        status: "processing",
        progress: 0,
        kind: "export",
    };
    activeDownloads.set(id, job);
    try {
        await prisma.downloadQueueJob.create({
            data: {
                id,
                kind: "export",
                exportSpec: opts.exportSpec,
                url: "",
                title: opts.title,
                mediaType: opts.mediaType ?? "video",
                sourcePlatform: "local",
                status: "processing",
                progress: 0,
            },
        });
    } catch (err) {
        console.error("[Export] Failed to persist export job", err);
    }
    return id;
}

/** Reset an existing export job back to "processing" for an in-place retry,
 *  re-seeding its live entry so progress/SSE work again. */
export async function resetExportJob(id: string, title: string): Promise<void> {
    activeDownloads.set(id, {
        id, url: "", title, status: "processing", progress: 0, kind: "export",
    });
    try {
        await prisma.downloadQueueJob.update({
            where: { id },
            data: { status: "processing", progress: 0, error: null, completedAt: null },
        });
    } catch (err) {
        console.error("[Export] Failed to reset export job", err);
    }
}

/** Update an export job's progress (0–100). Memory-only — the SSE reads this;
 *  the DB row is finalised on completion to avoid a write per ffmpeg tick. */
export function updateExportProgress(id: string, progress: number): void {
    const job = activeDownloads.get(id);
    // Don't move the bar for a job the user paused/cancelled.
    if (job && job.status !== "paused" && job.status !== "cancelled") {
        job.progress = Math.max(0, Math.min(100, progress));
    }
}

/**
 * Register the export's ffmpeg child process under its job id so the shared
 * pauseJob (SIGSTOP) / resumeJob (SIGCONT) / cancelJob (SIGTERM) — and clearing
 * the queue, which cancels active jobs — all act on it just like a download.
 */
export function registerExportProcess(id: string, proc: ReturnType<typeof spawn>): void {
    jobProcesses.set(id, proc);
}

/** Mark an export job finished (or failed) and persist the final state. */
export async function finishExportJob(
    id: string,
    result: { downloadPath?: string; error?: string },
): Promise<void> {
    jobProcesses.delete(id);
    const job = activeDownloads.get(id);

    // If the user cancelled mid-encode, ffmpeg's non-zero exit lands here as an
    // "error" — but the job is already terminal. Don't clobber that state.
    if (job && job.status === "cancelled") return;

    const status: DownloadStatus = result.error ? "error" : "completed";
    if (job) {
        job.status = status;
        job.progress = result.error ? job.progress : 100;
        job.downloadPath = result.downloadPath;
        job.error = result.error;
        job.completedAt = Date.now();
    }
    try {
        await prisma.downloadQueueJob.update({
            where: { id },
            data: {
                status,
                progress: result.error ? undefined : 100,
                downloadPath: result.downloadPath,
                error: result.error ?? null,
                completedAt: new Date(),
            },
        });
    } catch (err) {
        console.error("[Export] Failed to finalise export job", err);
    }
}
