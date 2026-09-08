import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import { getServerSettings } from "@/lib/settings";
import { getFfmpegPath, getFfprobePath } from "@/lib/ffmpeg";
import { getYtdlpPath } from "@/lib/ytdlp";
import { GALLERY_DL_PATH } from "@/lib/gallery-dl";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);

type BinaryCheck = {
    name: string;
    available: boolean;
    version: string | null;
    path: string | null;
    error: string | null;
    /** What this dependency does, in the app's terms. */
    purpose: string;
    /** Shell command that installs it, shown when it's missing. */
    fix: string | null;
    /** Whether the app is usable at all without it. */
    required: boolean;
    /** True when the app ships its own copy and nothing needs installing. */
    bundled: boolean;
};

type ProviderCheck = {
    name: string;
    configured: boolean;
    reachable: boolean | null;
    error: string | null;
    purpose: string;
    /** Where in the app the user configures this. */
    fix: string | null;
};

/**
 * ffmpeg and ffprobe ship inside the app bundle, so a fresh machine needs
 * nothing for them. yt-dlp and gallery-dl are deliberately NOT bundled: they
 * track site changes and need updating far more often than this app ships, so
 * a pinned copy would rot between releases. They're detected instead, with the
 * install command surfaced in Settings > System Health when they're absent.
 */
const DEPENDENCY_INFO = {
    "yt-dlp": {
        purpose: "Downloads video and audio from YouTube, X, TikTok, Instagram, Reddit and other sites.",
        fix: "brew install yt-dlp",
        required: true,
        bundled: false,
    },
    "gallery-dl": {
        purpose: "Downloads images and photo galleries from social posts that yt-dlp can't handle.",
        fix: "brew install gallery-dl",
        required: false,
        bundled: false,
    },
    ffmpeg: {
        purpose: "Merges video and audio streams, converts formats, and renders every edit and export.",
        fix: "brew install ffmpeg",
        required: true,
        bundled: true,
    },
    ffprobe: {
        purpose: "Reads duration, resolution and codec details from media files.",
        fix: "brew install ffmpeg",
        required: false,
        bundled: true,
    },
} as const;

async function checkBinary(
    name: keyof typeof DEPENDENCY_INFO,
    command: string,
    args: string[],
    versionParser?: (stdout: string, stderr: string) => string
): Promise<BinaryCheck> {
    const info = DEPENDENCY_INFO[name];
    const describe = (result: Omit<BinaryCheck, "purpose" | "fix" | "required" | "bundled">): BinaryCheck => ({
        ...result,
        purpose: info.purpose,
        // A bundled binary going missing shouldn't happen, but if it does the
        // same install command is still a working way out for the user.
        fix: result.available ? null : info.fix,
        required: info.required,
        bundled: info.bundled,
    });
    try {
        const { stdout, stderr } = await execFileAsync(command, args, {
            timeout: 10000,
            env: { ...process.env, PATH: `${process.env.PATH}:${os.homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin` },
        });
        const version = versionParser
            ? versionParser(stdout, stderr)
            : (stdout || stderr).trim().split("\n")[0];
        return describe({ name, available: true, version, path: command, error: null });
    } catch (err: any) {
        if (err.code === "ENOENT") {
            return describe({ name, available: false, version: null, path: null, error: `${name} not found` });
        }
        if (err.killed) {
            return describe({ name, available: false, version: null, path: null, error: `${name} timed out` });
        }
        const output = (err.stdout || err.stderr || "").trim().split("\n")[0];
        if (output) {
            return describe({ name, available: true, version: output, path: command, error: null });
        }
        return describe({ name, available: false, version: null, path: null, error: err.message?.split("\n")[0] || "Unknown error" });
    }
}

async function checkFfmpeg(): Promise<BinaryCheck> {
    const ffmpegPath = getFfmpegPath();
    return checkBinary("ffmpeg", ffmpegPath, ["-version"], (stdout) => {
        const match = stdout.match(/ffmpeg version (\S+)/);
        return match ? match[1] : stdout.split("\n")[0];
    });
}

async function checkFfprobe(): Promise<BinaryCheck> {
    // Was looking for ffprobe alongside ffmpeg, but @ffmpeg-installer ships
    // only ffmpeg — so this never resolved. ffprobe now comes from its own
    // bundled package.
    return checkBinary("ffprobe", getFfprobePath(), ["-version"], (stdout) => {
        const match = stdout.match(/ffprobe version (\S+)/);
        return match ? match[1] : stdout.split("\n")[0];
    });
}

const R2_INFO = {
    purpose: "Optional. Backs your library up to Cloudflare R2 or any S3-compatible bucket.",
    fix: "Add your keys under Settings > Cloud.",
};

async function checkR2(): Promise<ProviderCheck> {
    const settings = getServerSettings();
    const creds = settings.r2_credentials;

    if (!creds?.s3Endpoint || !creds?.s3Bucket || !creds?.s3AccessKey || !creds?.s3SecretKey) {
        return { name: "Cloudflare R2 / S3", configured: false, reachable: null, error: "Missing credentials", ...R2_INFO };
    }

    try {
        const client = new S3Client({
            region: creds.s3Region || "auto",
            endpoint: creds.s3Endpoint,
            credentials: {
                accessKeyId: creds.s3AccessKey,
                secretAccessKey: creds.s3SecretKey,
            },
        });
        await client.send(new HeadBucketCommand({ Bucket: creds.s3Bucket }));
        return { name: "Cloudflare R2 / S3", configured: true, reachable: true, error: null, ...R2_INFO };
    } catch (err: any) {
        const msg = err.name === "NotFound"
            ? `Bucket "${creds.s3Bucket}" not found`
            : err.name === "403" || err.$metadata?.httpStatusCode === 403
                ? "Access denied — check your keys"
                : err.message?.split("\n")[0] || "Connection failed";
        return { name: "Cloudflare R2 / S3", configured: true, reachable: false, error: msg, ...R2_INFO };
    }
}

async function checkAiProvider(
    name: string,
    apiKey: string | undefined,
    testUrl: string,
    authHeader: string,
    info: { purpose: string; fix: string }
): Promise<ProviderCheck> {
    if (!apiKey) {
        return { name, configured: false, reachable: null, error: "API key not set", ...info };
    }

    try {
        const res = await fetch(testUrl, {
            method: "GET",
            headers: { Authorization: `${authHeader} ${apiKey}` },
            signal: AbortSignal.timeout(10000),
        });
        if (res.ok || res.status === 200) {
            return { name, configured: true, reachable: true, error: null, ...info };
        }
        if (res.status === 401) {
            return { name, configured: true, reachable: false, error: "Invalid API key", ...info };
        }
        return { name, configured: true, reachable: false, error: `HTTP ${res.status}`, ...info };
    } catch (err: any) {
        return { name, configured: true, reachable: false, error: err.message?.split("\n")[0] || "Connection failed", ...info };
    }
}

export async function POST() {
    try {
        const settings = getServerSettings();

        const [ytdlp, gallerydl, ffmpeg, ffprobe, r2, openai, groq] =
            await Promise.all([
                // Probe exactly what the downloader will invoke — checking a
                // bare "yt-dlp" from PATH could report healthy while the app
                // runs a different (or absent) binary via getYtdlpPath().
                checkBinary("yt-dlp", getYtdlpPath(), ["--version"]),
                checkBinary("gallery-dl", GALLERY_DL_PATH, ["--version"]),
                checkFfmpeg(),
                checkFfprobe(),
                checkR2(),
                checkAiProvider(
                    "OpenAI",
                    settings.openaiApiKey,
                    "https://api.openai.com/v1/models",
                    "Bearer",
                    {
                        purpose: "Optional. Transcribes audio with Whisper so you can search inside videos and generate subtitles.",
                        fix: "Add an API key under Settings > AI Transcription.",
                    },
                ),
                checkAiProvider(
                    "Groq",
                    settings.groqApiKey,
                    "https://api.groq.com/openai/v1/models",
                    "Bearer",
                    {
                        purpose: "Optional. A faster, free-tier alternative to OpenAI for transcription.",
                        fix: "Add an API key under Settings > AI Transcription.",
                    },
                ),
            ]);

        return NextResponse.json({
            binaries: { ytdlp, gallerydl, ffmpeg, ffprobe },
            providers: { r2, openai, groq },
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Preflight check failed", details: error.message },
            { status: 500 }
        );
    }
}
