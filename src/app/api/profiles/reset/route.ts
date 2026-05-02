import { NextResponse } from "next/server";
import { resetToDefaultProfiles } from "@/lib/profiles";
import { prisma } from "@/lib/prisma";

// POST — Re-add any missing preset profiles (does not touch existing profiles).
export async function POST() {
    try {
        const added = await resetToDefaultProfiles();
        const profiles = await prisma.downloadProfile.findMany({
            orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        });
        return NextResponse.json({ success: true, added, profiles });
    } catch (error: any) {
        console.error("Failed to reset profiles:", error);
        return NextResponse.json({ error: "Failed to reset profiles", details: error.message }, { status: 500 });
    }
}
