import { NextResponse } from "next/server";
import { getAllJobs } from "@/lib/download-manager";

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
