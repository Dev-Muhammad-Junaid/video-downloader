import { NextResponse } from "next/server";
import { getServerSettings, updateServerSetting } from "@/lib/settings";

export async function GET() {
    try {
        const settings = getServerSettings();
        return NextResponse.json({ watchFolder: settings.watchFolder || "" });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to load settings", details: error.message },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const { watchFolder } = await req.json();

        if (typeof watchFolder !== "string") {
            return NextResponse.json({ error: "Watch folder must be a string" }, { status: 400 });
        }

        updateServerSetting("watchFolder", watchFolder.trim());
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to save watch folder", details: error.message },
            { status: 500 }
        );
    }
}
