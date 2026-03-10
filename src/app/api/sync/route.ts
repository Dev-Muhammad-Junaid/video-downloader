import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const { videoId, credentials } = await req.json();

        if (!videoId || !credentials || !credentials.s3Endpoint || !credentials.s3Bucket) {
            return NextResponse.json({ error: "Missing required data" }, { status: 400 });
        }

        const video = await prisma.video.findUnique({ where: { id: videoId } });
        if (!video || !video.localPath) {
            return NextResponse.json({ error: "Video not found" }, { status: 404 });
        }

        const s3Client = new S3Client({
            region: credentials.s3Region || "auto",
            endpoint: credentials.s3Endpoint,
            credentials: {
                accessKeyId: credentials.s3AccessKey,
                secretAccessKey: credentials.s3SecretKey,
            },
        });

        const fileStream = fs.createReadStream(video.localPath);
        const fileName = path.basename(video.localPath);
        const key = `uploads/${Date.now()}_${fileName}`;

        await s3Client.send(
            new PutObjectCommand({
                Bucket: credentials.s3Bucket,
                Key: key,
                Body: fileStream,
                ContentType: "video/mp4",
            })
        );

        // Optionally update the DB with a remote URL if the bucket is public
        // const remoteUrl = `${credentials.s3Endpoint}/${credentials.s3Bucket}/${key}`;

        return NextResponse.json({ success: true, message: "Uploaded successfully", key });
    } catch (error: any) {
        console.error("S3 Upload error:", error);
        return NextResponse.json({ error: "Failed to upload to cloud", details: error.message }, { status: 500 });
    }
}
