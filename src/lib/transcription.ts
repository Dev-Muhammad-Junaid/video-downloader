import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getFfmpegPath } from "@/lib/ffmpeg";

// Directory to store generated subtitle files
const transcriptsDir = path.join(process.cwd(), "transcripts");
if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
}

export function getTranscriptsDir() {
    return transcriptsDir;
}

/**
 * Extract audio from a video file into a temporary MP3 file using ffmpeg.
 * Returns the path to the temp audio file.
 */
function extractAudio(videoPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const tmpPath = path.join(os.tmpdir(), `snapdown_audio_${Date.now()}.mp3`);
        const proc = spawn(getFfmpegPath(), [
            "-i", videoPath,
            "-vn",                     // No video
            "-ar", "16000",            // 16kHz sample rate (Whisper's preferred rate)
            "-ac", "1",                // Mono
            "-b:a", "64k",             // Lower bitrate for faster uploads
            "-y",                      // Overwrite output without asking
            tmpPath,
        ]);

        let stderr = "";
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        proc.on("error", (err) => {
            reject(new Error(`Failed to start ffmpeg: ${err.message}`));
        });
        proc.on("close", (code) => {
            if (code === 0) {
                resolve(tmpPath);
            } else {
                reject(new Error(`ffmpeg audio extraction failed (code ${code}): ${stderr.slice(-500)}`));
            }
        });
    });
}

/**
 * Convert OpenAI verbose_json transcript to WebVTT format string.
 */
function transcriptToVtt(transcript: OpenAI.Audio.Transcription): string {
    const lines: string[] = ["WEBVTT", ""];

    const verboseTranscript = transcript as OpenAI.Audio.TranscriptionVerbose;
    if (!verboseTranscript.segments || verboseTranscript.segments.length === 0) {
        // Fallback: no segments, write a single cue for the full text
        lines.push("1");
        lines.push(`00:00:00.000 --> 00:31:00.000`);
        lines.push(transcript.text);
        return lines.join("\n");
    }

    verboseTranscript.segments.forEach((seg, i) => {
        const start = formatVttTime(seg.start);
        const end = formatVttTime(seg.end);
        lines.push(`${i + 1}`);
        lines.push(`${start} --> ${end}`);
        lines.push(seg.text.trim());
        lines.push("");
    });

    return lines.join("\n");
}

/**
 * Format a time value (in seconds) to VTT format HH:MM:SS.mmm
 */
function formatVttTime(seconds: number): string {
    const totalMs = Math.round(seconds * 1000);
    const ms = totalMs % 1000;
    const totalSecs = Math.floor(totalMs / 1000);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);

    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export interface TranscriptionResult {
    text: string;
    vttPath: string;
    logId?: string;
}

export type TranscriptionProvider = "openai" | "groq";

/**
 * Main transcription function.
 * - Extracts audio from video
 * - Sends to OpenAI Whisper API
 * - Saves .vtt subtitle file to /transcripts/
 * - Returns plain text and vtt path
 */
export async function transcribeVideo(
    videoId: string,
    localPath: string,
    apiKey: string,
    language?: string,
    provider: TranscriptionProvider = "openai"
): Promise<TranscriptionResult> {
    const openai = new OpenAI({
        apiKey,
        ...(provider === "groq" ? { baseURL: "https://api.groq.com/openai/v1" } : {}),
    });

    let tempAudioPath: string | null = null;

    try {
        // 1. Extract audio
        tempAudioPath = await extractAudio(localPath);

        // 2. Send to Whisper API
        const audioFile = fs.createReadStream(tempAudioPath);
        const transcript = await openai.audio.transcriptions.create({
            file: audioFile,
            model: provider === "groq" ? "whisper-large-v3-turbo" : "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["segment"],
            ...(language ? { language } : {}),
        });

        // 3. Generate VTT content
        const vttContent = transcriptToVtt(transcript);
        const vttPath = path.join(transcriptsDir, `${videoId}.vtt`);
        fs.writeFileSync(vttPath, vttContent, "utf-8");

        // 4. Clean up temp audio
        try { fs.unlinkSync(tempAudioPath); } catch { }

        return {
            text: transcript.text,
            vttPath,
        };
    } catch (err) {
        // Clean up temp audio on failure
        if (tempAudioPath) {
            try { fs.unlinkSync(tempAudioPath); } catch { }
        }
        throw err;
    }
}

/**
 * Convenience wrapper: transcribe and persist results to DB in one call.
 * Also creates a DownloadLog entry for the History page.
 */
export async function transcribeAndSave(
    videoId: string,
    apiKey: string,
    language?: string,
    provider: TranscriptionProvider = "openai"
): Promise<TranscriptionResult> {
    const startTime = Date.now();

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new Error("Video not found");
    if (video.mediaType === "image") throw new Error("Transcription is not supported for images");

    // Create log entry immediately so it shows in History
    const logEntry = await prisma.downloadLog.create({
        data: {
            url: video.originalUrl || video.localPath,
            title: video.title,
            sourcePlatform: video.sourcePlatform || "local",
            status: "downloading",
            videoId: video.id,
            type: "transcription",
        },
    });

    // Mark video as processing
    await prisma.video.update({
        where: { id: videoId },
        data: { transcriptStatus: "processing" },
    });

    try {
        const result = await transcribeVideo(videoId, video.localPath, apiKey, language, provider);

        const elapsed = (Date.now() - startTime) / 1000;

        // Persist transcript to Video
        await prisma.video.update({
            where: { id: videoId },
            data: {
                transcriptText: result.text,
                transcriptPath: result.vttPath,
                transcriptStatus: "completed",
            },
        });

        // Update log to completed with a snippet of the transcript
        const snippet = result.text.length > 500 ? result.text.slice(0, 500) + "…" : result.text;
        await prisma.downloadLog.update({
            where: { id: logEntry.id },
            data: {
                status: "completed",
                completedAt: new Date(),
                duration: elapsed,
                output: snippet,
            },
        });

        return { ...result, logId: logEntry.id };
    } catch (err: any) {
        const elapsed = (Date.now() - startTime) / 1000;

        // Mark video as error
        await prisma.video.update({
            where: { id: videoId },
            data: { transcriptStatus: "error" },
        }).catch(() => {});

        // Update log to error with full message
        await prisma.downloadLog.update({
            where: { id: logEntry.id },
            data: {
                status: "error",
                completedAt: new Date(),
                duration: elapsed,
                errorMessage: err.message || "Unknown transcription error",
                output: err.stack?.slice(0, 500) || err.message || "Unknown error",
            },
        }).catch(() => {});

        throw err;
    }
}
