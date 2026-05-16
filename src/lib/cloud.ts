import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import path from "path";
import { prisma } from "./prisma";
import { getServerSettings } from "./settings";

export const UPLOAD_MIME: Record<string, string> = {
    ".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska",
    ".mov": "video/quicktime", ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac",
    ".ogg": "audio/ogg", ".opus": "audio/opus", ".flac": "audio/flac", ".wav": "audio/wav",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
};

export function createS3Client(credentials: {
    s3Region?: string;
    s3Endpoint: string;
    s3AccessKey: string;
    s3SecretKey: string;
}) {
    return new S3Client({
        region: credentials.s3Region || "auto",
        endpoint: credentials.s3Endpoint,
        credentials: {
            accessKeyId: credentials.s3AccessKey,
            secretAccessKey: credentials.s3SecretKey,
        },
    });
}

export async function uploadToCloud(videoId: string): Promise<{ key: string; cloudUrl: string }> {
    const settings = getServerSettings();
    const credentials = settings.r2_credentials;

    if (!credentials || !credentials.s3Endpoint || !credentials.s3Bucket) {
        throw new Error("Cloud credentials not configured. Go to Settings to set up R2/S3.");
    }
    if (!credentials.s3AccessKey || !credentials.s3SecretKey) {
        throw new Error("Cloud access key or secret key is missing in settings.");
    }

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new Error(`Video ${videoId} not found in database`);
    if (!video.localPath) throw new Error(`Video "${video.title}" has no local file path`);
    if (!fs.existsSync(video.localPath)) throw new Error(`Local file not found: ${video.localPath}`);
    if (video.cloudKey) return { key: video.cloudKey, cloudUrl: video.cloudUrl || "" };

    const startTime = Date.now();
    const fileSize = fs.statSync(video.localPath).size;
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    console.log(`[Cloud] Uploading: ${video.title} (${sizeMB}MB)`);

    const s3Client = createS3Client(credentials);
    const fileName = path.basename(video.localPath);
    const key = `uploads/${Date.now()}_${fileName}`;
    const ext = path.extname(video.localPath).toLowerCase();
    const contentType = UPLOAD_MIME[ext] || "application/octet-stream";

    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: credentials.s3Bucket,
            Key: key,
            Body: fs.createReadStream(video.localPath),
            ContentType: contentType,
            ContentLength: fileSize,
        },
        partSize: 10 * 1024 * 1024,
        queueSize: 4,
    });

    await upload.done();

    const cloudUrl = `${credentials.s3Endpoint}/${credentials.s3Bucket}/${key}`;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    await prisma.video.update({
        where: { id: videoId },
        data: { cloudKey: key, cloudUrl, cloudUploadedAt: new Date() },
    });

    console.log(`[Cloud] Uploaded ${videoId} (${sizeMB}MB) in ${elapsed}s -> ${key}`);

    await prisma.downloadLog.create({
        data: {
            url: video.originalUrl || video.localPath,
            title: video.title,
            sourcePlatform: video.sourcePlatform,
            status: "completed",
            type: "cloud-upload",
            fileSize,
            videoId,
            duration: parseFloat(elapsed),
            completedAt: new Date(),
            output: `Uploaded to ${key} (${sizeMB}MB)`,
        },
    });

    return { key, cloudUrl };
}

export async function deleteFromCloud(videoId: string): Promise<void> {
    const settings = getServerSettings();
    const credentials = settings.r2_credentials;
    if (!credentials?.s3Bucket) throw new Error("Cloud credentials not configured.");

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video?.cloudKey) throw new Error("Video is not in the cloud.");

    const s3Client = createS3Client(credentials);
    await s3Client.send(new DeleteObjectCommand({ Bucket: credentials.s3Bucket, Key: video.cloudKey }));

    await prisma.video.update({
        where: { id: videoId },
        data: { cloudKey: null, cloudUrl: null, cloudUploadedAt: null },
    });
}
