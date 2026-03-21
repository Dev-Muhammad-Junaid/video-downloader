import { NextResponse } from "next/server";
import { getServerSettings, updateServerSetting } from "@/lib/settings";

export async function GET() {
    const settings = getServerSettings();
    return NextResponse.json(settings.r2_credentials || {});
}

export async function POST(req: Request) {
    try {
        const credentials = await req.json();
        
        // Basic validation
        if (!credentials.s3Endpoint || !credentials.s3Bucket || !credentials.s3AccessKey || !credentials.s3SecretKey) {
            return NextResponse.json({ error: "All S3 fields are required for server-side persistence" }, { status: 400 });
        }

        updateServerSetting("r2_credentials", credentials);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to save cloud credentials", details: error.message }, { status: 500 });
    }
}
