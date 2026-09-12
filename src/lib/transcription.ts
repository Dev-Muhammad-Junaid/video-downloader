import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getFfmpegPath, probeDuration } from "@/lib/ffmpeg";
import { appDataPath } from "@/lib/app-paths";

/**
 * Where generated .vtt subtitle files live.
 *
 * This used to be `<cwd>/transcripts`, which inside the packaged app is
 * SnapDown.app/Contents/Resources/standalone/transcripts — inside the bundle,
 * so every transcript was deleted by the next app update (the same defect that
 * destroyed downloaded media). The user data directory survives updates.
 */
const transcriptsDir = appDataPath("transcripts");
if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
}

export function getTranscriptsDir() {
    return transcriptsDir;
}

/**
 * The Whisper endpoints reject uploads over 25 MB with a bare
 * "413 Request Entity Too Large". Stay under it with headroom for multipart
 * overhead.
 */
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

/**
 * Extract speech audio to a temp file.
 *
 * Opus at 16 kbps rather than the previous MP3 at 64 kbps. Opus is designed
 * for exactly this — wideband speech at very low bitrates — and Whisper
 * downsamples to 16 kHz mono internally anyway, so the extra bits were being
 * spent on detail the model discards. Measured on a real file:
 *
 *   mp3 64k (old)   0.92 MB / 2 min   →  hits 25 MB at  55 min
 *   opus 16k        0.23 MB / 2 min   →  hits 25 MB at 3.6 h
 *
 * That alone turns "anything over ~55 minutes fails" into "anything under
 * three and a half hours is a single upload". Verified against the live Groq
 * whisper-large-v3-turbo endpoint, which accepts ogg/opus and returns the
 * same verbose_json segments.
 *
 * `startSeconds`/`durationSeconds` extract one slice, for chunked uploads.
 */
function extractAudio(
    videoPath: string,
    startSeconds?: number,
    durationSeconds?: number,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const tmpPath = path.join(
            os.tmpdir(),
            `snapdown_audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.ogg`,
        );
        const args: string[] = [];
        // Input-side seek: ffmpeg skips to the keyframe before decoding, so
        // slicing a long file stays fast instead of decoding from zero.
        if (startSeconds !== undefined) args.push("-ss", String(startSeconds));
        args.push("-i", videoPath);
        if (durationSeconds !== undefined) args.push("-t", String(durationSeconds));
        args.push(
            "-vn",                     // No video
            "-ar", "16000",            // 16kHz — Whisper's own working rate
            "-ac", "1",                // Mono
            "-c:a", "libopus",
            "-b:a", "16k",
            "-y",
            tmpPath,
        );

        const proc = spawn(getFfmpegPath(), args);

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

    const model = provider === "groq" ? "whisper-large-v3-turbo" : "whisper-1";
    const created: string[] = [];

    const cleanUp = () => {
        for (const f of created) {
            try { fs.unlinkSync(f); } catch { /* already gone */ }
        }
    };

    /** One upload. Kept separate so the single and chunked paths agree. */
    const transcribeChunk = async (audioPath: string) =>
        (await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model,
            response_format: "verbose_json",
            timestamp_granularities: ["segment"],
            ...(language ? { language } : {}),
        })) as OpenAI.Audio.TranscriptionVerbose;

    try {
        const firstPass = await extractAudio(localPath);
        created.push(firstPass);

        let transcript: OpenAI.Audio.TranscriptionVerbose;

        if (fs.statSync(firstPass).size <= MAX_UPLOAD_BYTES) {
            transcript = await transcribeChunk(firstPass);
        } else {
            // Long enough that even 16 kbps Opus exceeds the upload limit
            // (roughly 3.5 hours), so send it in pieces and stitch the results
            // back together. Without this the API just returns a bare 413 and
            // the transcription fails outright, which is what used to happen to
            // anything over about 55 minutes.
            const duration = probeDuration(localPath);
            if (!duration) {
                throw new Error(
                    "This file is too large to transcribe in one request, and its duration " +
                    "couldn't be determined in order to split it.",
                );
            }

            const size = fs.statSync(firstPass).size;
            const chunkCount = Math.ceil(size / MAX_UPLOAD_BYTES);
            const chunkSeconds = duration / chunkCount;
            console.log(`[Transcription] ${(size / 1048576).toFixed(1)} MB exceeds the upload limit — splitting into ${chunkCount} chunks`);

            const allSegments: OpenAI.Audio.TranscriptionVerbose["segments"] = [];
            const allText: string[] = [];

            for (let i = 0; i < chunkCount; i++) {
                const offset = i * chunkSeconds;
                const chunkPath = await extractAudio(localPath, offset, chunkSeconds);
                created.push(chunkPath);

                const part = await transcribeChunk(chunkPath);
                allText.push(part.text.trim());

                // Each chunk's timestamps start at zero, so shift them back to
                // where they belong in the full recording — otherwise every
                // chunk's subtitles would pile up at the start of the video.
                for (const seg of part.segments ?? []) {
                    allSegments.push({ ...seg, start: seg.start + offset, end: seg.end + offset });
                }

                try { fs.unlinkSync(chunkPath); } catch { /* best effort */ }
            }

            transcript = {
                text: allText.join(" "),
                segments: allSegments,
            } as OpenAI.Audio.TranscriptionVerbose;
        }

        const vttContent = transcriptToVtt(transcript);
        const vttPath = path.join(transcriptsDir, `${videoId}.vtt`);
        fs.writeFileSync(vttPath, vttContent, "utf-8");

        cleanUp();

        return {
            text: transcript.text,
            vttPath,
        };
    } catch (err) {
        cleanUp();
        // A bare "413 Request Entity Too Large" tells the user nothing about
        // what to do, and it's the error they were most likely to hit.
        if (err instanceof Error && /413|too large/i.test(err.message)) {
            throw new Error(
                "The audio was too large for the transcription service to accept, even after " +
                "compression and splitting. Try a shorter clip, or trim the video first.",
            );
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
