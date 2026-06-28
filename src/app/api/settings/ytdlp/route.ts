import { NextResponse } from "next/server";
import { getServerSettings, updateServerSetting } from "@/lib/settings";

export async function GET() {
    try {
        const settings = getServerSettings();
        return NextResponse.json({ ytCookiesBrowser: settings.ytCookiesBrowser || "" });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to load settings", details: error.message },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const { ytCookiesBrowser } = await req.json();
        if (typeof ytCookiesBrowser !== "string") {
            return NextResponse.json({ error: "ytCookiesBrowser must be a string" }, { status: 400 });
        }
        updateServerSetting("ytCookiesBrowser", ytCookiesBrowser.trim());
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to save downloader settings", details: error.message },
            { status: 500 }
        );
    }
}
