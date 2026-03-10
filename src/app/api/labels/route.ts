import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const labels = await prisma.label.findMany({
            orderBy: { name: "asc" }
        });
        return NextResponse.json(labels);
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to fetch labels" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { name, color } = await req.json();

        if (!name || typeof name !== 'string') {
            return NextResponse.json({ error: "Label name is required" }, { status: 400 });
        }

        // Upsert standardizes it and prevents crashes on duplicates
        const label = await prisma.label.upsert({
            where: { name: name.trim().toLowerCase() },
            update: { color: color || null },
            create: { name: name.trim().toLowerCase(), color: color || null }
        });

        return NextResponse.json(label);
    } catch (error: any) {
        console.error("Failed to create label:", error);
        return NextResponse.json({ error: "Failed to create label" }, { status: 500 });
    }
}
