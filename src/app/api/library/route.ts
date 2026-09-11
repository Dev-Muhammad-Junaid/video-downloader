import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";

/**
 * The library listing.
 *
 * This used to PERMANENTLY DELETE any row whose file it couldn't stat, on
 * every single load, in the background and without telling anyone. That turned
 * every temporary absence into irreversible data loss:
 *
 *   - an external drive not plugged in yet
 *   - a network volume still mounting
 *   - a cloud-synced folder mid-restore
 *   - media that lived inside the app bundle, wiped by an app update
 *
 * The last one actually happened: downloads defaulted to a folder inside
 * SnapDown.app, so replacing the app deleted the media, and the next launch
 * then deleted every matching row. An empty library, permanently, from a
 * routine update.
 *
 * A file that isn't reachable right now is not the same as a file that is
 * gone forever, and only the user can tell the difference. Rows are therefore
 * never removed here — unreachable entries come back flagged so the UI can
 * show them as unavailable and let the user decide.
 */
export async function GET() {
    try {
        const videos = await prisma.video.findMany({
            orderBy: { createdAt: "desc" },
            include: { labels: true },
        });

        const withAvailability = await Promise.all(
            videos.map(async (video) => {
                let fileMissing = false;
                try {
                    await fs.access(video.localPath);
                } catch {
                    fileMissing = true;
                }
                return { ...video, fileMissing };
            }),
        );

        return NextResponse.json(withAvailability);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "Failed to fetch library", details: message }, { status: 500 });
    }
}
