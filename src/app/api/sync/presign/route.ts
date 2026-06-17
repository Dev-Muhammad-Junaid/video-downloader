import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";
import { getServerSettings } from "@/lib/settings";
import { createS3Client } from "@/lib/cloud";

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

        // Use requested expiry, or the configured urlExpiry from settings, capped at 7 days
        const configuredExpiry = credentials?.urlExpiry || 604800;
        const expiresIn = Math.min(requestedExpiry || configuredExpiry, 604800);

        // `s3Client` and the presigner's expected Client type come from slightly
        // different @aws-sdk minor versions, so TS sees two distinct (but runtime-
        // identical) Client types. Cast to the presigner's expected client type.
        const presignedUrl = await getSignedUrl(
            s3Client as unknown as Parameters<typeof getSignedUrl>[0],
            command,
            { expiresIn }
        );

        return NextResponse.json({ success: true, url: presignedUrl });
    } catch (error: any) {
        console.error("Presign error:", error);
        return NextResponse.json({ error: "Failed to generate presigned URL", details: error.message }, { status: 500 });
    }
}
