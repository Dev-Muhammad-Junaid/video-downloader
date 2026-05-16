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

        // If user marks this as default, demote any existing default (priority -1) first.
        const isDefault = !!data.isDefault || parseInt(data.priority || "0") === -1;
        if (isDefault) {
            await prisma.downloadProfile.updateMany({
                where: { priority: -1 },
                data: { priority: 0 },
            });
        }

        // Derive resolutionMode: explicit value wins, else fall back to legacy strictResolution bool
        const resolvedMode = data.resolutionMode || (data.strictResolution ? "strict" : "flexible");

        const profile = await prisma.downloadProfile.create({
            data: {
                name: data.name,
                sitePattern: data.sitePattern || "*",
                maxResolution: data.maxResolution || "best",
                preferredFormat: data.preferredFormat || "mp4",
                preferredImageFormat: data.preferredImageFormat || "original",
                autoCloudSync: !!data.autoCloudSync,
                requireManualFormat: !!data.requireManualFormat,
                strictResolution: resolvedMode === "strict",
                resolutionMode: resolvedMode,
                isActive: data.isActive !== false,
                priority: isDefault ? -1 : parseInt(data.priority || "0"),
            }
        });

        return NextResponse.json(profile);
    } catch (error: any) {
        console.error("Failed to create profile:", error);
        // Surface Prisma's actual message (e.g. unique constraint on name) so the UI can show it.
        const message = error?.code === "P2002"
            ? `A profile named "${error?.meta?.target ? error.meta.target.join(", ") : "this"}" already exists`
            : (error?.message || "Failed to create profile");
        return NextResponse.json({ error: message, code: error?.code }, { status: 500 });
    }
}
