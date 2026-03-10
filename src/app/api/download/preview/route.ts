import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

const GALLERY_DL_PATH = path.join(os.homedir(), ".local", "bin", "gallery-dl");

export async function POST(req: Request) {
    try {
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }

        // Try yt-dlp first (works for videos)
        try {
            const { stdout } = await execAsync(`yt-dlp -j "${url}"`);
            const lines = stdout.trim().split("\n");
            const metadata = JSON.parse(lines[0]);

            return NextResponse.json({
                id: metadata.id,
                title: metadata.title,
                duration: metadata.duration,
                originalUrl: metadata.webpage_url || url,
                sourcePlatform: metadata.extractor,
                thumbnail: metadata.thumbnail,
                viewCount: metadata.view_count,
                mediaType: "video",
            });
        } catch (ytdlpError) {
            console.log("yt-dlp failed, trying gallery-dl for image extraction...");
        }

        // Fallback: gallery-dl for image-only posts
        try {
            const { stdout } = await execAsync(`${GALLERY_DL_PATH} -j "${url}"`);

            // gallery-dl -j outputs a JSON array of entries:
            // [2, {directory_metadata}]  — directory/metadata info
            // [3, "https://image_url"]   — actual image URL
            const data = JSON.parse(stdout);

            let imageUrl = "";
            let title = "";
            let platform = "unknown";

            for (const entry of data) {
                if (!Array.isArray(entry)) continue;

                // Type 2: directory metadata — extract title/content
                if (entry[0] === 2 && typeof entry[1] === "object") {
                    const meta = entry[1];
                    title = meta.content || meta.description || meta.tweet_id?.toString() || "Image";
                    if (title.length > 100) title = title.substring(0, 100) + "...";
                    platform = meta.subcategory || meta.category || "twitter";
                }

                // Type 3: image URL
                if (entry[0] === 3 && typeof entry[1] === "string" && entry[1].startsWith("http")) {
                    imageUrl = entry[1];
                }
            }

            if (!imageUrl) {
                return NextResponse.json(
                    { error: "No downloadable media found at this URL" },
                    { status: 400 }
                );
            }

            return NextResponse.json({
                id: imageUrl,
                title,
                duration: null,
                originalUrl: url,
                sourcePlatform: platform,
                thumbnail: imageUrl,
                viewCount: null,
                mediaType: "image",
                imageUrl,
            });
        } catch (galleryError: any) {
            console.error("gallery-dl also failed:", galleryError.message);
            return NextResponse.json(
                { error: "Failed to extract media information", details: galleryError.message },
                { status: 500 }
            );
        }
    } catch (error: any) {
        console.error("Failed to extract preview:", error);
        return NextResponse.json(
            { error: "Failed to extract media information", details: error.message },
            { status: 500 }
        );
    }
}
