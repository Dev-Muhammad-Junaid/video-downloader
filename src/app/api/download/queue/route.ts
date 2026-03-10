import { NextResponse } from "next/server";
import { getAllJobs, clearCompletedJobs, clearAllJobs } from "@/lib/download-manager";

export async function GET() {
    try {
        const jobs = getAllJobs();
        return NextResponse.json(jobs);
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to fetch queue", details: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const mode = searchParams.get("mode") || "completed";

        if (mode === "all") {
            clearAllJobs();
        } else {
            clearCompletedJobs();
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to clear queue", details: error.message },
            { status: 500 }
        );
    }
}
