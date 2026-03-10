import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: Request) {
    try {
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }

        // Use yt-dlp to extract JSON metadata
        const { stdout } = await execAsync(`yt-dlp -j "${url}"`);

        // yt-dlp might return multiple JSON objects if it's a playlist. For now, assume single video.
        // We split by newline and parse the first valid JSON
        const lines = stdout.trim().split("\n");
        const metadata = JSON.parse(lines[0]);

        const result = {
            id: metadata.id,
            title: metadata.title,
            duration: metadata.duration,
            originalUrl: metadata.webpage_url || url,
            sourcePlatform: metadata.extractor,
            thumbnail: metadata.thumbnail,
            viewCount: metadata.view_count,
        };

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Failed to extract preview:", error);
        return NextResponse.json(
            { error: "Failed to extract media information", details: error.message },
            { status: 500 }
        );
    }
}
