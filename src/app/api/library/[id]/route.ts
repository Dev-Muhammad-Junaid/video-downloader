import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { title } = await req.json();

        if (!title || typeof title !== 'string') {
            return NextResponse.json({ error: "Invalid title" }, { status: 400 });
        }

        const updated = await prisma.video.update({
            where: { id },
            data: { title: title.trim() }
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Failed to rename video:", error);
        return NextResponse.json(
            { error: "Failed to rename video", details: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        // 1. Find the video to get the localPath
        const video = await prisma.video.findUnique({ where: { id } });

        if (!video) {
            return NextResponse.json({ error: "Video not found" }, { status: 404 });
        }

        // 2. Delete the DB record (cascading removes M2M label relations)
        await prisma.video.delete({ where: { id } });

        // 3. Unlink the physical file from the local disk
        try {
            await fs.unlink(video.localPath);
        } catch (fsError: any) {
            // Log it but do not fail the request if the file was already gone
            console.warn(`File already missing from disk: ${video.localPath}`, fsError.message);
        }

        return NextResponse.json({ success: true, deletedId: id });
    } catch (error: any) {
        console.error("Failed to delete video:", error);
        return NextResponse.json(
            { error: "Failed to delete video", details: error.message },
            { status: 500 }
        );
    }
}
