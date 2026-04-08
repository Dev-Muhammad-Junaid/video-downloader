import { NextResponse } from "next/server";
import { trimVideo, cropVideo, trimAndCrop, burnSubtitles } from "@/lib/media-editor";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { videoId, action, params } = body;

        if (!videoId || !action) {
            return NextResponse.json({ error: "Missing required fields: videoId, action" }, { status: 400 });
        }

        let result;

        if (action === "trim") {
            const { startTime, endTime } = params;
            if (startTime === undefined || endTime === undefined) {
                return NextResponse.json({ error: "Trim requires startTime and endTime" }, { status: 400 });
            }
            result = await trimVideo(videoId, startTime, endTime);
        } else if (action === "crop") {
            const { w, h, x, y } = params;
            if (w === undefined || h === undefined || x === undefined || y === undefined) {
                return NextResponse.json({ error: "Crop requires w, h, x, and y parameters" }, { status: 400 });
            }
            result = await cropVideo(videoId, w, h, x, y);
        } else if (action === "trim-crop") {
            const { startTime, endTime, w, h, x, y } = params;
            if (startTime === undefined || endTime === undefined ||
                w === undefined || h === undefined || x === undefined || y === undefined) {
                return NextResponse.json({ error: "trim-crop requires startTime, endTime, w, h, x, and y" }, { status: 400 });
            }
            result = await trimAndCrop(videoId, startTime, endTime, w, h, x, y);
        } else if (action === "burn-subtitles") {
            const { srtContent, stylePreset, fontFamily } = params;
            if (!srtContent) {
                return NextResponse.json({ error: "burn-subtitles requires srtContent" }, { status: 400 });
            }
            result = await burnSubtitles(videoId, srtContent, stylePreset || "classic", fontFamily);
        } else {
            return NextResponse.json({ error: "Invalid action. Must be 'trim', 'crop', 'trim-crop', or 'burn-subtitles'." }, { status: 400 });
        }

        return NextResponse.json({ success: true, video: result });

    } catch (error: any) {
        console.error("Media Edit Error:", error);
        return NextResponse.json({ error: "Failed to edit media", details: error.message }, { status: 500 });
    }
}
