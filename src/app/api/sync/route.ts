import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getServerSettings } from "@/lib/settings";

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

function getCredentials(bodyCredentials?: any) {
    // Prefer server-side settings, fall back to request body
    const settings = getServerSettings();
    const creds = settings.r2_credentials;
    if (creds && creds.s3Endpoint && creds.s3Bucket && creds.s3AccessKey && creds.s3SecretKey) {
        return creds;
    }
    return bodyCredentials;
}

// GET — list all cloud-uploaded videos
export async function GET() {
    try {
        const videos = await prisma.video.findMany({
            where: { cloudKey: { not: null } },
            orderBy: { cloudUploadedAt: "desc" },
            include: { labels: true },
        });

        return NextResponse.json(videos);
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to fetch cloud videos", details: error.message }, { status: 500 });
    }
}

// POST — upload a video to R2 and track in DB
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { videoId } = body;
        const credentials = getCredentials(body.credentials);

        if (!videoId || !credentials || !credentials.s3Endpoint || !credentials.s3Bucket) {
            return NextResponse.json({ error: "Missing required data. Configure R2 credentials in Settings." }, { status: 400 });
        }

        const video = await prisma.video.findUnique({ where: { id: videoId } });
        if (!video || !video.localPath) {
            return NextResponse.json({ error: "Video not found" }, { status: 404 });
        }

        // If already uploaded, return early
        if (video.cloudKey) {
            return NextResponse.json({ success: true, message: "Already uploaded", key: video.cloudKey });
        }

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

        // Build the cloud URL
        const cloudUrl = `${credentials.s3Endpoint}/${credentials.s3Bucket}/${key}`;

        // Update DB with cloud info
        await prisma.video.update({
            where: { id: videoId },
            data: {
                cloudKey: key,
                cloudUrl: cloudUrl,
                cloudUploadedAt: new Date(),
            },
        });

        return NextResponse.json({ success: true, message: "Uploaded successfully", key, cloudUrl });
    } catch (error: any) {
        console.error("S3 Upload error:", error);
        return NextResponse.json({ error: "Failed to upload to cloud", details: error.message }, { status: 500 });
    }
}

// DELETE — remove a video from cloud storage
export async function DELETE(req: Request) {
    try {
        const body = await req.json();
        const { videoId } = body;
        const credentials = getCredentials(body.credentials);

        if (!videoId || !credentials || !credentials.s3Endpoint || !credentials.s3Bucket) {
            return NextResponse.json({ error: "Missing required data. Configure R2 credentials in Settings." }, { status: 400 });
        }

        const video = await prisma.video.findUnique({ where: { id: videoId } });
        if (!video) {
            return NextResponse.json({ error: "Video not found" }, { status: 404 });
        }
        if (!video.cloudKey) {
            return NextResponse.json({ error: "Video is not in the cloud" }, { status: 400 });
        }

        const s3Client = createS3Client(credentials);

        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: credentials.s3Bucket,
                Key: video.cloudKey,
            })
        );

        // Clear cloud fields in DB
        await prisma.video.update({
            where: { id: videoId },
            data: {
                cloudKey: null,
                cloudUrl: null,
                cloudUploadedAt: null,
            },
        });

        return NextResponse.json({ success: true, message: "Removed from cloud" });
    } catch (error: any) {
        console.error("S3 Delete error:", error);
        return NextResponse.json({ error: "Failed to remove from cloud", details: error.message }, { status: 500 });
    }
}
