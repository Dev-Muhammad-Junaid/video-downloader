import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const video = await prisma.video.findUnique({
            where: { id },
            select: { thumbnailPath: true },
        });

        if (!video?.thumbnailPath || !fs.existsSync(video.thumbnailPath)) {
            return new NextResponse(null, { status: 404 });
        }

        const buffer = fs.readFileSync(video.thumbnailPath);
        const ext = path.extname(video.thumbnailPath).toLowerCase();
        
        const contentType = ext === ".webp" ? "image/webp" 
            : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
            : ext === ".png" ? "image/png"
            : "image/webp";

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=86400, immutable",
            },
        });
    } catch (error: any) {
        console.error("Failed to serve thumbnail:", error);
        return NextResponse.json({ error: "Failed to serve thumbnail" }, { status: 500 });
    }
}
