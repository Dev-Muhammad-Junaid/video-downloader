import { NextResponse } from "next/server";
import { getJobById, pauseJob, resumeJob, cancelJob } from "@/lib/download-manager";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const job = await getJobById(id);

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }

        return NextResponse.json(job);
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to fetch job", details: error.message },
            { status: 500 }
        );
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const action = body?.action;
        if (action === "pause") {
            await pauseJob(id);
        } else if (action === "resume") {
            await resumeJob(id);
        } else if (action === "cancel") {
            await cancelJob(id);
        } else {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to update job state", details: error.message },
            { status: 500 }
        );
    }
}
