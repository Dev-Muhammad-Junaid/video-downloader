import { NextResponse } from "next/server";
import { getServerSettings, updateServerSetting } from "@/lib/settings";

export async function GET() {
    const settings = getServerSettings();
    // Mask the API key for display — only show last 4 chars
    const maskedKey = settings.openaiApiKey
        ? `sk-...${settings.openaiApiKey.slice(-4)}`
        : "";
    return NextResponse.json({
        openaiApiKey: maskedKey,
        hasKey: !!settings.openaiApiKey,
        whisperLanguage: settings.whisperLanguage || "",
    });
}

export async function POST(req: Request) {
    try {
        const { openaiApiKey, whisperLanguage } = await req.json();

        if (openaiApiKey !== undefined) {
            updateServerSetting("openaiApiKey", openaiApiKey);
        }
        if (whisperLanguage !== undefined) {
            updateServerSetting("whisperLanguage", whisperLanguage);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to save AI settings", details: error.message },
            { status: 500 }
        );
    }
}
