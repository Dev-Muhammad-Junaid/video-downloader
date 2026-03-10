import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { labelId } = await req.json();

        if (!labelId) return NextResponse.json({ error: "Label ID required" }, { status: 400 });

        const updated = await prisma.video.update({
            where: { id },
            data: {
                labels: {
                    connect: { id: labelId }
                }
            },
            include: { labels: true }
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to attach label" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { labelId } = await req.json();

        if (!labelId) return NextResponse.json({ error: "Label ID required" }, { status: 400 });

        const updated = await prisma.video.update({
            where: { id },
            data: {
                labels: {
                    disconnect: { id: labelId }
                }
            },
            include: { labels: true }
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to detach label" }, { status: 500 });
    }
}
