import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transcribeAndSave } from "@/lib/transcription";
import { getServerSettings } from "@/lib/settings";

// GET /api/transcription/[id] — get transcript status / text for a video
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const video = await prisma.video.findUnique({
            where: { id },
            select: {
                id: true,
                transcriptStatus: true,
                transcriptText: true,
                transcriptPath: true,
                mediaType: true,
            },
        });

        if (!video) {
            return NextResponse.json({ error: "Video not found" }, { status: 404 });
        }

        return NextResponse.json({
            id: video.id,
            status: video.transcriptStatus ?? "none",
            text: video.transcriptText ?? null,
            hasVtt: !!video.transcriptPath,
            vttPath: video.transcriptPath ?? null,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST /api/transcription/[id] — trigger transcription for a video
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await req.json().catch(() => ({}));
        const settings = getServerSettings();
        const provider = body.provider || settings.transcriptionProvider || "openai";
        const apiKey: string =
            body.apiKey ||
            (provider === "groq"
                ? (settings.groqApiKey || process.env.GROQ_API_KEY || "")
                : (settings.openaiApiKey || process.env.OPENAI_API_KEY || ""));
        const language: string | undefined = body.language || settings.whisperLanguage || undefined;

        if (!apiKey) {
            return NextResponse.json(
                {
                    error:
                        provider === "groq"
                            ? "No Groq API key provided. Add it in Settings."
                            : "No OpenAI API key provided. Add it in Settings.",
                },
                { status: 400 }
            );
        }

        // Check video exists and is a video (not image)
        const video = await prisma.video.findUnique({
            where: { id },
            select: { id: true, mediaType: true, transcriptStatus: true, title: true },
        });

        if (!video) {
            return NextResponse.json({ error: "Video not found" }, { status: 404 });
        }
        if (video.mediaType === "image") {
            return NextResponse.json({ error: "Images cannot be transcribed" }, { status: 400 });
        }
        if (video.transcriptStatus === "processing") {
            return NextResponse.json({ message: "Transcription already in progress" }, { status: 202 });
        }

        // Run in background — don't await, respond immediately
        transcribeAndSave(id, apiKey, language, provider).catch((err) => {
            console.error(`[Transcription] Failed for ${id}:`, err.message);
        });

        return NextResponse.json({ message: "Transcription started", id });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
