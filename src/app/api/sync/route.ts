import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getServerSettings } from "@/lib/settings";
import { createS3Client, UPLOAD_MIME, uploadToCloud } from "@/lib/cloud";
import { Upload } from "@aws-sdk/lib-storage";

function getCredentials(bodyCredentials?: any) {
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

        // Delegate to the shared uploadToCloud helper (streaming, multipart-capable)
        const result = await uploadToCloud(videoId);
        return NextResponse.json({ success: true, message: "Uploaded successfully", key: result.key, cloudUrl: result.cloudUrl });
    } catch (error: any) {
        console.error("Cloud upload error:", error);
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
        if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
        if (!video.cloudKey) return NextResponse.json({ error: "Video is not in the cloud" }, { status: 400 });

        const s3Client = createS3Client(credentials);
        await s3Client.send(new DeleteObjectCommand({ Bucket: credentials.s3Bucket, Key: video.cloudKey }));

        await prisma.video.update({
            where: { id: videoId },
            data: { cloudKey: null, cloudUrl: null, cloudUploadedAt: null },
        });

        return NextResponse.json({ success: true, message: "Removed from cloud" });
    } catch (error: any) {
        console.error("Cloud delete error:", error);
        return NextResponse.json({ error: "Failed to remove from cloud", details: error.message }, { status: 500 });
    }
}
