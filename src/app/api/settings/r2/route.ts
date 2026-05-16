import { NextResponse } from "next/server";
import { getServerSettings, updateServerSetting } from "@/lib/settings";

export async function GET() {
    try {
        const settings = getServerSettings();
        const r2: any = settings.r2_credentials || {};

        // Mask the secret key for display — only show last 4 chars if it exists
        const maskedSecret = r2.s3SecretKey
            ? `***...${r2.s3SecretKey.slice(-4)}`
            : "";

        return NextResponse.json({
            ...r2,
            s3SecretKey: maskedSecret,
            hasKey: !!r2.s3SecretKey
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to load settings", details: error.message },
            { status: 500 }
        );
    }
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
