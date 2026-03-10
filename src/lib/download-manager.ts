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

const globalForDownloads = global as unknown as { activeDownloads: Map<string, DownloadJob> };
export const activeDownloads = globalForDownloads.activeDownloads || new Map<string, DownloadJob>();
if (process.env.NODE_ENV !== "production") globalForDownloads.activeDownloads = activeDownloads;

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

                        const textToParse = `${info.title || ''} ${info.description || ''} ${(info.tags || []).join(' ')}`.toLowerCase();

                        // Score categories based on keyword hits
                        const scores: Record<string, number> = {};

                        for (const [category, keywords] of Object.entries(taxonomy)) {
                            scores[category] = 0;
                            for (const keyword of keywords) {
                                // use simple word boundary regex to avoid partial matches
                                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                                const match = textToParse.match(regex);
                                if (match) {
                                    scores[category] += match.length;
                                }
                            }
                        }

                        // Sort categories by score descending
                        const sortedCategories = Object.entries(scores)
                            .filter(([_, score]) => score > 0)
                            .sort((a, b) => b[1] - a[1]);

                        // Take top 2 generalized categories
                        const topCategories = sortedCategories.slice(0, 2).map(c => c[0]);
                        topCategories.forEach(c => allTags.add(c));

                        // cleanup info json file since we have extracted what we needed
                        fs.unlinkSync(infoJsonPath);
                    }
                } catch (jsonErr) {
                    console.error("Failed to parse yt-dlp info JSON:", jsonErr);
                }

                // If any labels were collected, string them up for Prisma connectOrCreate
                const finalTagsToInsert = Array.from(allTags);

                if (finalTagsToInsert.length > 0) {
                    dbData.labels = {
                        connectOrCreate: finalTagsToInsert
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
