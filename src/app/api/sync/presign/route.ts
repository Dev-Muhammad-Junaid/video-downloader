import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
    const settings = getServerSettings();
    const creds = settings.r2_credentials;
    if (creds && creds.s3Endpoint && creds.s3Bucket && creds.s3AccessKey && creds.s3SecretKey) {
        return creds;
    }
    return bodyCredentials;
}

// POST — generate a presigned URL for a cloud file
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { videoId, expiresIn: requestedExpiry } = body;
        const credentials = getCredentials(body.credentials);

        if (!videoId || !credentials || !credentials.s3Endpoint || !credentials.s3Bucket) {
            return NextResponse.json({ error: "Missing required data. Configure R2 credentials in Settings." }, { status: 400 });
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

        // Use requested expiry or default to 7 days, cap at 7 days max
        const expiresIn = Math.min(requestedExpiry || 604800, 604800);

        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

        return NextResponse.json({ success: true, url: presignedUrl });
    } catch (error: any) {
        console.error("Presign error:", error);
        return NextResponse.json({ error: "Failed to generate presigned URL", details: error.message }, { status: 500 });
    }
}
