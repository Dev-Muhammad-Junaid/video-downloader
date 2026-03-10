import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const videos = await prisma.video.findMany({
            orderBy: { createdAt: "desc" },
            include: { labels: true }
        });

        return NextResponse.json(videos);
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to fetch library" }, { status: 500 });
    }
}
