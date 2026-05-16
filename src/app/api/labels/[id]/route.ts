import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH — Update a label (e.g. toggle autoCloudSync)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const data = await req.json();
        const { id } = await params;

        if (data.name !== undefined && (typeof data.name !== 'string' || data.name.trim() === '')) {
            return NextResponse.json({ error: "Label name must be a non-empty string" }, { status: 400 });
        }

        const label = await prisma.label.update({
            where: { id },
            data: {
                name: data.name,
                color: data.color,
                autoCloudSync: data.autoCloudSync,
            }
        });

        return NextResponse.json(label);
    } catch (error: any) {
        console.error("Failed to update label:", error);
        return NextResponse.json({ error: "Failed to update label", details: error.message }, { status: 500 });
    }
}

// DELETE — Remove a label
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.label.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Failed to delete label:", error);
        return NextResponse.json({ error: "Failed to delete label", details: error.message }, { status: 500 });
    }
}
