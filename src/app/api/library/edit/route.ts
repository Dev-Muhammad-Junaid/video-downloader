import { NextResponse } from "next/server";
import { trimVideo, cropVideo, trimAndCrop, burnSubtitles, trimBurnSubtitles, cropBurnSubtitles, trimCropBurnSubtitles, trimAudio, convertToMp4 } from "@/lib/media-editor";

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
        } else if (action === "trim-audio") {
            const { startTime, endTime } = params;
            if (startTime === undefined || endTime === undefined) {
                return NextResponse.json({ error: "trim-audio requires startTime and endTime" }, { status: 400 });
            }
            result = await trimAudio(videoId, startTime, endTime);
        } else if (action === "trim-burn") {
            const { startTime, endTime, srtContent, stylePreset, fontFamily } = params;
            if (startTime === undefined || endTime === undefined || !srtContent) {
                return NextResponse.json({ error: "trim-burn requires startTime, endTime, and srtContent" }, { status: 400 });
            }
            result = await trimBurnSubtitles(videoId, startTime, endTime, srtContent, stylePreset || "classic", fontFamily);
        } else if (action === "crop-burn") {
            const { w, h, x, y, srtContent, stylePreset, fontFamily } = params;
            if (w === undefined || h === undefined || x === undefined || y === undefined || !srtContent) {
                return NextResponse.json({ error: "crop-burn requires w, h, x, y, and srtContent" }, { status: 400 });
            }
            result = await cropBurnSubtitles(videoId, w, h, x, y, srtContent, stylePreset || "classic", fontFamily);
        } else if (action === "trim-crop-burn") {
            const { startTime, endTime, w, h, x, y, srtContent, stylePreset, fontFamily } = params;
            if (startTime === undefined || endTime === undefined || w === undefined || h === undefined || x === undefined || y === undefined || !srtContent) {
                return NextResponse.json({ error: "trim-crop-burn requires all trim, crop, and subtitle params" }, { status: 400 });
            }
            result = await trimCropBurnSubtitles(videoId, startTime, endTime, w, h, x, y, srtContent, stylePreset || "classic", fontFamily);
        } else if (action === "convert-mp4") {
            result = await convertToMp4(videoId);
        } else {
            return NextResponse.json({ error: "Invalid action." }, { status: 400 });
        }

        return NextResponse.json({ success: true, video: result });

    } catch (error: any) {
        console.error("Media Edit Error:", error);
        return NextResponse.json({ error: "Failed to edit media", details: error.message }, { status: 500 });
    }
}
