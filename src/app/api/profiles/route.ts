import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDefaultProfile } from "@/lib/profiles";

// GET — List all download profiles
export async function GET() {
    try {
        await ensureDefaultProfile();
        const profiles = await prisma.downloadProfile.findMany({
            orderBy: [{ priority: "desc" }, { createdAt: "desc" }]
        });
        return NextResponse.json(profiles);
    } catch (error: any) {
        console.error("Failed to fetch profiles:", error);
        return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
    }
}

// POST — Create a new profile
export async function POST(req: Request) {
    try {
        const data = await req.json();
        
        if (!data.name) {
            return NextResponse.json({ error: "Profile name is required" }, { status: 400 });
        }

        const profile = await prisma.downloadProfile.create({
            data: {
                name: data.name,
                sitePattern: data.sitePattern || "*",
                maxResolution: data.maxResolution || "best",
                preferredFormat: data.preferredFormat || "mp4",
                autoCloudSync: !!data.autoCloudSync,
                requireManualFormat: !!data.requireManualFormat,
                isActive: data.isActive !== false,
                priority: parseInt(data.priority || "0"),
            }
        });

        return NextResponse.json(profile);
    } catch (error: any) {
        console.error("Failed to create profile:", error);
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
    }
}
