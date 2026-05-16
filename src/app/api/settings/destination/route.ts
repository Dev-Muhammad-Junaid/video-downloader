import { NextResponse } from "next/server";
import { getDownloadsDir, setDownloadsDir } from "@/lib/download-manager";

// GET — return the current download destination
export async function GET() {
    try {
        return NextResponse.json({ path: getDownloadsDir() });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to load settings", details: error.message },
            { status: 500 }
        );
    }
}

// POST — update the download destination
export async function POST(req: Request) {
    try {
        const { path: newPath } = await req.json();

        if (!newPath || typeof newPath !== "string") {
            return NextResponse.json({ error: "Path is required" }, { status: 400 });
        }

        setDownloadsDir(newPath.trim());
        return NextResponse.json({ success: true, path: getDownloadsDir() });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to set destination", details: error.message }, { status: 500 });
    }
}
