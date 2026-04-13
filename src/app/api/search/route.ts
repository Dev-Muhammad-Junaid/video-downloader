import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface SearchResult {
    id: string;
    title: string;
    sourcePlatform: string | null;
    mediaType: string;
    createdAt: string;
    thumbnailPath: string | null;
    localPath: string;
    fileSize: number | null;
    duration: number | null;
    labels: { id: string; name: string; color: string | null }[];
    cloudKey: string | null;
    originalUrl: string | null;
    transcriptStatus: string | null;
    transcriptPath: string | null;
    // Search-specific fields
    matchedIn: ("title" | "transcript" | "label" | "platform")[];
    transcriptSnippet: string | null; // Highlighted excerpt from transcript
}

/**
 * Extract a short snippet around the first occurrence of `query` in a long text,
 * surrounding it with a small context window.
 */
function extractSnippet(text: string, query: string, windowSize = 120): string {
    const lower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    const idx = lower.indexOf(queryLower);
    if (idx === -1) return text.slice(0, windowSize) + "...";

    const start = Math.max(0, idx - Math.floor(windowSize / 2));
    const end = Math.min(text.length, idx + query.length + Math.ceil(windowSize / 2));
    let snippet = text.slice(start, end);
    if (start > 0) snippet = "…" + snippet;
    if (end < text.length) snippet = snippet + "…";
    return snippet;
}

// GET /api/search?q=<query>&mode=<quick|deep>&platform=<platform>&type=<video|image|all>
export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const query = searchParams.get("q")?.trim() ?? "";
    const mode = searchParams.get("mode") ?? "quick"; // "quick" or "deep"
    const platform = searchParams.get("platform") ?? "all";
    const mediaType = searchParams.get("type") ?? "all";
    const labelFilter = searchParams.get("label") ?? "";

    if (!query) {
        return NextResponse.json({ results: [], total: 0 });
    }

    try {
        // Fetch all matching videos from SQLite (SQLite doesn't have full-text search natively
        // without extensions, so we fetch and filter in JS for transcript matching)
        const whereClause: any = {};

        if (platform !== "all") {
            whereClause.sourcePlatform = { equals: platform, mode: "insensitive" };
        }
        if (mediaType !== "all") {
            whereClause.mediaType = mediaType;
        }

        const allVideos = await prisma.video.findMany({
            where: whereClause,
            include: {
                labels: { select: { id: true, name: true, color: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        const queryLower = query.toLowerCase();
        const results: SearchResult[] = [];

        for (const video of allVideos) {
            const matchedIn: SearchResult["matchedIn"] = [];
            let transcriptSnippet: string | null = null;

            // 1. Title match
            if (video.title.toLowerCase().includes(queryLower)) {
                matchedIn.push("title");
            }

            // 2. Platform match
            if (video.sourcePlatform?.toLowerCase().includes(queryLower)) {
                matchedIn.push("platform");
            }

            // 3. Label match
            const labelFilterLower = labelFilter.toLowerCase();
            const matchedLabel = video.labels.some(
                (l) => l.name.toLowerCase().includes(queryLower) ||
                    (labelFilterLower && l.name.toLowerCase().includes(labelFilterLower))
            );
            if (matchedLabel) {
                matchedIn.push("label");
            }

            // 4. Transcript match (deep search mode only or if transcript exists)
            if (mode === "deep" || !matchedIn.length) {
                if (video.transcriptText && video.transcriptText.toLowerCase().includes(queryLower)) {
                    matchedIn.push("transcript");
                    transcriptSnippet = extractSnippet(video.transcriptText, query);
                }
            }

            if (matchedIn.length > 0) {
                results.push({
                    id: video.id,
                    title: video.title,
                    sourcePlatform: video.sourcePlatform,
                    mediaType: video.mediaType,
                    createdAt: video.createdAt.toISOString(),
                    thumbnailPath: video.thumbnailPath,
                    localPath: video.localPath,
                    fileSize: video.fileSize,
                    duration: video.duration,
                    labels: video.labels,
                    cloudKey: video.cloudKey,
                    originalUrl: video.originalUrl,
                    transcriptStatus: video.transcriptStatus,
                    transcriptPath: video.transcriptPath,
                    matchedIn,
                    transcriptSnippet,
                });
            }
        }

        // Sort: title matches first, then transcript, then others
        const priority = (r: SearchResult) => {
            if (r.matchedIn.includes("title")) return 0;
            if (r.matchedIn.includes("label")) return 1;
            if (r.matchedIn.includes("transcript")) return 2;
            return 3;
        };
        results.sort((a, b) => priority(a) - priority(b));

        return NextResponse.json({ results, total: results.length, query, mode });
    } catch (err: any) {
        console.error("[Search] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
