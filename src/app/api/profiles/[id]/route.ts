import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH — Update a profile
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const data = await req.json();
        const { id } = await params;

        const profile = await prisma.downloadProfile.update({
            where: { id },
            data: {
                name: data.name,
                sitePattern: data.sitePattern,
                maxResolution: data.maxResolution,
                preferredFormat: data.preferredFormat,
                autoCloudSync: data.autoCloudSync,
                requireManualFormat: data.requireManualFormat,
                isActive: data.isActive,
                priority: data.priority != null ? parseInt(data.priority) : undefined,
            }
        });

        return NextResponse.json(profile);
    } catch (error: any) {
        console.error("Failed to update profile:", error);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
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
