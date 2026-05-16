import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { getServerSettings } from "@/lib/settings";
import { getFfmpegPath } from "@/lib/ffmpeg";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);

type BinaryCheck = {
    name: string;
    available: boolean;
    version: string | null;
    path: string | null;
    error: string | null;
};

type ProviderCheck = {
    name: string;
    configured: boolean;
    reachable: boolean | null;
    error: string | null;
};

async function checkBinary(
    name: string,
    command: string,
    args: string[],
    versionParser?: (stdout: string, stderr: string) => string
): Promise<BinaryCheck> {
    try {
        const { stdout, stderr } = await execFileAsync(command, args, {
            timeout: 10000,
            env: { ...process.env, PATH: `${process.env.PATH}:${os.homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin` },
        });
        const version = versionParser
            ? versionParser(stdout, stderr)
            : (stdout || stderr).trim().split("\n")[0];
        return { name, available: true, version, path: command, error: null };
    } catch (err: any) {
        if (err.code === "ENOENT") {
            return { name, available: false, version: null, path: null, error: `${name} not found in PATH` };
        }
        if (err.killed) {
            return { name, available: false, version: null, path: null, error: `${name} timed out` };
        }
        const output = (err.stdout || err.stderr || "").trim().split("\n")[0];
        if (output) {
            return { name, available: true, version: output, path: command, error: null };
        }
        return { name, available: false, version: null, path: null, error: err.message?.split("\n")[0] || "Unknown error" };
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
    const ffmpegPath = getFfmpegPath();
    const ffprobeDir = path.dirname(ffmpegPath);
    const ffprobeName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
    const ffprobePath = ffmpegPath === "ffmpeg"
        ? "ffprobe"
        : path.join(ffprobeDir, ffprobeName);

    return checkBinary("ffprobe", ffprobePath, ["-version"], (stdout) => {
        const match = stdout.match(/ffprobe version (\S+)/);
        return match ? match[1] : stdout.split("\n")[0];
    });
}

async function checkR2(): Promise<ProviderCheck> {
    const settings = getServerSettings();
    const creds = settings.r2_credentials;

    if (!creds?.s3Endpoint || !creds?.s3Bucket || !creds?.s3AccessKey || !creds?.s3SecretKey) {
        return { name: "Cloudflare R2 / S3", configured: false, reachable: null, error: "Missing credentials" };
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
        return { name: "Cloudflare R2 / S3", configured: true, reachable: true, error: null };
    } catch (err: any) {
        const msg = err.name === "NotFound"
            ? `Bucket "${creds.s3Bucket}" not found`
            : err.name === "403" || err.$metadata?.httpStatusCode === 403
                ? "Access denied — check your keys"
                : err.message?.split("\n")[0] || "Connection failed";
        return { name: "Cloudflare R2 / S3", configured: true, reachable: false, error: msg };
    }
}

async function checkAiProvider(
    name: string,
    apiKey: string | undefined,
    testUrl: string,
    authHeader: string
): Promise<ProviderCheck> {
    if (!apiKey) {
        return { name, configured: false, reachable: null, error: "API key not set" };
    }

    try {
        const res = await fetch(testUrl, {
            method: "GET",
            headers: { Authorization: `${authHeader} ${apiKey}` },
            signal: AbortSignal.timeout(10000),
        });
        if (res.ok || res.status === 200) {
            return { name, configured: true, reachable: true, error: null };
        }
        if (res.status === 401) {
            return { name, configured: true, reachable: false, error: "Invalid API key" };
        }
        return { name, configured: true, reachable: false, error: `HTTP ${res.status}` };
    } catch (err: any) {
        return { name, configured: true, reachable: false, error: err.message?.split("\n")[0] || "Connection failed" };
    }
}

export async function POST() {
    try {
        const settings = getServerSettings();

        const [ytdlp, gallerydl, ffmpeg, ffprobe, r2, openai, groq] =
            await Promise.all([
                checkBinary("yt-dlp", "yt-dlp", ["--version"]),
                checkBinary("gallery-dl", path.join(os.homedir(), ".local", "bin", "gallery-dl"), ["--version"]),
                checkFfmpeg(),
                checkFfprobe(),
                checkR2(),
                checkAiProvider(
                    "OpenAI",
                    settings.openaiApiKey,
                    "https://api.openai.com/v1/models",
                    "Bearer"
                ),
                checkAiProvider(
                    "Groq",
                    settings.groqApiKey,
                    "https://api.groq.com/openai/v1/models",
                    "Bearer"
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
