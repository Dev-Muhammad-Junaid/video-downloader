import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import https from "https";
import http from "http";
import { prisma } from "@/lib/prisma";

export type DownloadStatus = "pending" | "downloading" | "processing" | "completed" | "error";

export interface DownloadJob {
    id: string;
    url: string;
    title: string;
    status: DownloadStatus;
    progress: number; // 0 to 100
    downloadPath?: string;
    error?: string;
}

const globalForDownloads = global as unknown as { activeDownloads: Map<string, DownloadJob> };
export const activeDownloads = globalForDownloads.activeDownloads || new Map<string, DownloadJob>();
if (process.env.NODE_ENV !== "production") globalForDownloads.activeDownloads = activeDownloads;

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

export function getAllJobs() {
    return Array.from(activeDownloads.values());
}

export function clearCompletedJobs() {
    for (const [id, job] of activeDownloads) {
        if (job.status === "completed" || job.status === "error") {
            activeDownloads.delete(id);
        }
    }
}

export function clearAllJobs() {
    for (const [id, job] of activeDownloads) {
        // Only keep actively downloading jobs
        if (job.status !== "downloading" && job.status !== "processing") {
            activeDownloads.delete(id);
        }
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

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const client = url.startsWith("https") ? https : http;

        client.get(url, (response) => {
            // Handle redirects
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                fs.unlinkSync(dest);
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                resolve();
            });
        }).on("error", (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

export async function startDownload(url: string, title: string, sourcePlatform: string, mediaType: string = "video", imageUrl?: string) {
    const id = Math.random().toString(36).substring(2, 15);
    const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    const job: DownloadJob = {
        id,
        url,
        title,
        status: "downloading",
        progress: 0,
    };

    activeDownloads.set(id, job);

    if (mediaType === "image" && imageUrl) {
        // Image download: directly fetch the image URL
        const ext = path.extname(new URL(imageUrl).pathname) || ".jpg";
        const fileName = `${safeTitle}_${id}${ext}`;
        const outputPath = path.join(downloadsDir, fileName);

        try {
            await downloadFile(imageUrl, outputPath);

            job.status = "completed";
            job.progress = 100;
            job.downloadPath = outputPath;
            activeDownloads.set(id, job);

            let fileSize = 0;
            try {
                const stats = fs.statSync(outputPath);
                fileSize = stats.size;
            } catch (e) { }

            // DB insert
            const isDuplicate = url ? await prisma.video.findFirst({ where: { originalUrl: url } }) : null;
            const allTags = new Set<string>();
            if (isDuplicate) allTags.add("Duplicate");

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

            await prisma.video.create({ data: dbData });
        } catch (err: any) {
            job.status = "error";
            job.error = err.message || "Image download failed";
            activeDownloads.set(id, job);
            console.error("Image download failed:", err);
        }

        return job;
    }

    // Video download: existing yt-dlp logic
    const fileName = `${safeTitle}_${id}.mp4`;
    const outputPath = path.join(downloadsDir, fileName);

    const ytdlp = spawn("yt-dlp", [
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format",
        "mp4",
        "-o",
        outputPath,
        "--write-info-json",
        "--newline",
        url,
    ]);

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

    ytdlp.on("close", async (code) => {
        if (code === 0) {
            job.status = "completed";
            job.progress = 100;
            job.downloadPath = outputPath;
            activeDownloads.set(id, job);

            let fileSize = 0;
            try {
                const stats = fs.statSync(outputPath);
                fileSize = stats.size;
            } catch (e) { }

            try {
                const isDuplicate = url ? await prisma.video.findFirst({ where: { originalUrl: url } }) : null;

                const dbData: any = {
                    title,
                    originalUrl: url,
                    sourcePlatform,
                    localPath: outputPath,
                    fileSize,
                    mediaType: "video",
                };

                const allTags = new Set<string>();
                if (isDuplicate) allTags.add("Duplicate");

                // Read info JSON for taxonomy scoring
                const infoJsonPath = outputPath.replace('.mp4', '.info.json');
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

                await prisma.video.create({ data: dbData });
            } catch (err) {
                console.error("Failed to insert completed video into DB:", err);
            }
        } else {
            job.status = "error";
            job.error = `Process exited with code ${code}`;
            activeDownloads.set(id, job);
        }
    });

    return job;
}
