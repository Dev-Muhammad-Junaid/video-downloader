import { spawn } from "child_process";
import path from "path";
import fs from "fs";
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

const activeDownloads = new Map<string, DownloadJob>();

// Ensure downloads directory exists
const downloadsDir = path.join(process.cwd(), "downloads");
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

export function getJob(id: string) {
    return activeDownloads.get(id);
}

export function getAllJobs() {
    return Array.from(activeDownloads.values());
}

export async function startDownload(url: string, title: string, sourcePlatform: string) {
    const id = Math.random().toString(36).substring(2, 15);
    const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const fileName = `${safeTitle}_${id}.mp4`;
    const outputPath = path.join(downloadsDir, fileName);

    const job: DownloadJob = {
        id,
        url,
        title,
        status: "downloading",
        progress: 0,
    };

    activeDownloads.set(id, job);

    const ytdlp = spawn("yt-dlp", [
        "-f",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format",
        "mp4",
        "-o",
        outputPath,
        "--write-info-json", // write metadata to .info.json
        "--newline", // output progress on new lines
        url,
    ]);

    ytdlp.stdout.on("data", (data) => {
        const output = data.toString();

        // yt-dlp buffers stdout. We need to split by lines/carriage returns to parse correctly
        const parts = output.split(/[\r\n]+/);

        for (const part of parts) {
            // Parse progress. e.g. "[download]  23.5% of 10.00MiB at 1.50MiB/s ETA 00:05"
            const progressMatch = part.match(/\[download\]\s+(\d+\.\d+)%/);
            if (progressMatch && progressMatch[1]) {
                const p = parseFloat(progressMatch[1]);
                if (!isNaN(p)) {
                    job.progress = p;
                }
            }

            // Check if it's merging
            if (part.includes("[Merger]")) {
                job.status = "processing";
                job.progress = 100;
            }
        }

        activeDownloads.set(id, job);
    });

    ytdlp.stderr.on("data", (data) => {
        // yt-dlp sometimes outputs progress to stderr depending on the platform config
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

            // Get file size
            let fileSize = 0;
            try {
                const stats = fs.statSync(outputPath);
                fileSize = stats.size;
            } catch (e) { }

            // Add to database
            try {
                const isDuplicate = url ? await prisma.video.findFirst({
                    where: { originalUrl: url }
                }) : null;

                const dbData: any = {
                    title,
                    originalUrl: url,
                    sourcePlatform,
                    localPath: outputPath,
                    fileSize,
                };

                // Prepare tags for relation
                const allTags = new Set<string>();

                if (isDuplicate) {
                    allTags.add("Duplicate");
                }

                // Attempt to read and parse the info JSON to extract auto-labels
                const infoJsonPath = outputPath.replace('.mp4', '.info.json');
                try {
                    if (fs.existsSync(infoJsonPath)) {
                        const infoContent = fs.readFileSync(infoJsonPath, 'utf8');
                        const info = JSON.parse(infoContent);

                        // Extract native tags if available
                        if (Array.isArray(info.tags)) {
                            info.tags.forEach((tag: string) => {
                                if (tag && typeof tag === 'string') {
                                    allTags.add(tag.trim());
                                }
                            });
                        }

                        // Extract hashtags from description and title
                        const textToParse = `${info.title || ''} ${info.description || ''}`;
                        const hashtagMatches = textToParse.match(/#[\w_]+/g) || [];
                        hashtagMatches.forEach(tag => {
                            // remove the '#' character for the label name itself
                            allTags.add(tag.substring(1));
                        });

                        // cleanup info json file since we have extracted what we needed
                        fs.unlinkSync(infoJsonPath);
                    }
                } catch (jsonErr) {
                    console.error("Failed to parse yt-dlp info JSON:", jsonErr);
                }

                // If any labels were collected, string them up for Prisma connectOrCreate
                if (allTags.size > 0) {
                    dbData.labels = {
                        connectOrCreate: Array.from(allTags)
                            // some sanity bounds so we don't insert 50 paragraph long tags
                            .filter(t => t.length > 1 && t.length < 40)
                            .map(tag => ({
                                where: { name: tag },
                                create: { name: tag, color: "bg-sage-600/30 text-sage-foreground font-medium border-sage-500/30" }
                            }))
                    };
                }

                await prisma.video.create({
                    data: dbData,
                });
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
