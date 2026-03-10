import { NextResponse } from "next/server";
import { getJob } from "@/lib/download-manager";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const job = getJob(id);

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
