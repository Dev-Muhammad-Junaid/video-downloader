import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";

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

// POST — generate a presigned URL for a cloud file
export async function POST(req: Request) {
    try {
        const { videoId, credentials } = await req.json();

        if (!videoId || !credentials || !credentials.s3Endpoint || !credentials.s3Bucket) {
            return NextResponse.json({ error: "Missing required data" }, { status: 400 });
        }

        const video = await prisma.video.findUnique({ where: { id: videoId } });
        if (!video || !video.cloudKey) {
            return NextResponse.json({ error: "Video not found or not in cloud" }, { status: 404 });
        }

        const s3Client = createS3Client(credentials);

        const command = new GetObjectCommand({
            Bucket: credentials.s3Bucket,
            Key: video.cloudKey,
        });

        // Generate a presigned URL valid for 1 hour
        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        return NextResponse.json({ success: true, url: presignedUrl });
    } catch (error: any) {
        console.error("Presign error:", error);
        return NextResponse.json({ error: "Failed to generate presigned URL", details: error.message }, { status: 500 });
    }
}
