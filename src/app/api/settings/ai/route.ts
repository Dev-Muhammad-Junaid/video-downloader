import { NextResponse } from "next/server";
import { getServerSettings, updateServerSetting } from "@/lib/settings";

export async function GET() {
    try {
        const settings = getServerSettings();
        // Mask API keys for display — only show last 4 chars
        const maskedOpenAiKey = settings.openaiApiKey
            ? `sk-...${settings.openaiApiKey.slice(-4)}`
            : "";
        const maskedGroqKey = settings.groqApiKey
            ? `gsk_...${settings.groqApiKey.slice(-4)}`
            : "";
        return NextResponse.json({
            provider: settings.transcriptionProvider || "openai",
            openaiApiKey: maskedOpenAiKey,
            groqApiKey: maskedGroqKey,
            hasOpenAiKey: !!settings.openaiApiKey,
            hasGroqKey: !!settings.groqApiKey,
            whisperLanguage: settings.whisperLanguage || "",
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
        const { openaiApiKey, groqApiKey, provider, whisperLanguage } = await req.json();

        if (openaiApiKey !== undefined) {
            updateServerSetting("openaiApiKey", openaiApiKey);
        }
        if (groqApiKey !== undefined) {
            updateServerSetting("groqApiKey", groqApiKey);
        }
        if (provider !== undefined) {
            updateServerSetting("transcriptionProvider", provider);
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
