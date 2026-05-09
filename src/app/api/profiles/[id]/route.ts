import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH — Update a profile
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const data = await req.json();
        const { id } = await params;

        const isDefault = !!data.isDefault || (data.priority != null && parseInt(data.priority) === -1);
        if (isDefault) {
            await prisma.downloadProfile.updateMany({
                where: { priority: -1, NOT: { id } },
                data: { priority: 0 },
            });
        }

        // Derive resolutionMode: explicit value wins, else fall back to legacy strictResolution bool
        const resolvedMode = data.resolutionMode !== undefined
            ? data.resolutionMode
            : (data.strictResolution != null ? (data.strictResolution ? "strict" : "flexible") : undefined);

        const profile = await prisma.downloadProfile.update({
            where: { id },
            data: {
                name: data.name,
                sitePattern: data.sitePattern,
                maxResolution: data.maxResolution,
                preferredFormat: data.preferredFormat,
                preferredImageFormat: data.preferredImageFormat,
                autoCloudSync: data.autoCloudSync,
                requireManualFormat: data.requireManualFormat,
                strictResolution: resolvedMode !== undefined ? resolvedMode === "strict" : data.strictResolution,
                resolutionMode: resolvedMode,
                isActive: data.isActive,
                priority: isDefault ? -1 : (data.priority != null ? parseInt(data.priority) : undefined),
            }
        });

        return NextResponse.json(profile);
    } catch (error: any) {
        console.error("Failed to update profile:", error);
        const message = error?.code === "P2002"
            ? "A profile with that name already exists"
            : (error?.message || "Failed to update profile");
        return NextResponse.json({ error: message, code: error?.code }, { status: 500 });
    }
}

// DELETE — Remove a profile
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        
        await prisma.downloadProfile.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Failed to delete profile:", error);
        return NextResponse.json({ error: "Failed to delete profile" }, { status: 500 });
    }
}
