import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { prisma } from "./prisma";
import { getServerSettings } from "./settings";

function createS3Client(credentials: any) {
    return new S3Client({
        region: credentials.s3Region || "auto",
        endpoint: credentials.s3Endpoint,
        credentials: {
            accessKeyId: credentials.s3AccessKey,
            secretAccessKey: credentials.s3SecretKey,
        },
    });
}

export async function uploadToCloud(videoId: string) {
    const settings = getServerSettings();
    const credentials = settings.r2_credentials;

    if (!credentials || !credentials.s3Endpoint || !credentials.s3Bucket) {
        console.warn(`[Cloud] Skipping auto-sync for ${videoId}: Credentials not configured on server.`);
        return null;
    }

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video || !video.localPath || video.cloudKey) return null;

    try {
        console.log(`[Cloud] Auto-syncing video: ${video.title} (${videoId})`);
        
        const s3Client = createS3Client(credentials);
        const fileStream = fs.createReadStream(video.localPath);
        const fileName = path.basename(video.localPath);
        const key = `uploads/${Date.now()}_${fileName}`;

        // Determine content type
        const ext = path.extname(video.localPath).toLowerCase();
        const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
        const contentType = isImage ? `image/${ext.replace(".", "")}` : "video/mp4";

        await s3Client.send(
            new PutObjectCommand({
                Bucket: credentials.s3Bucket,
                Key: key,
                Body: fileStream,
                ContentType: contentType,
            })
        );

        const cloudUrl = `${credentials.s3Endpoint}/${credentials.s3Bucket}/${key}`;

        await prisma.video.update({
            where: { id: videoId },
            data: {
                cloudKey: key,
                cloudUrl: cloudUrl,
                cloudUploadedAt: new Date(),
            },
        });

        console.log(`[Cloud] Successfully uploaded ${videoId} to ${cloudUrl}`);
        return { key, cloudUrl };
    } catch (error) {
        console.error(`[Cloud] Failed to auto-sync ${videoId}:`, error);
        return null;
    }
}
