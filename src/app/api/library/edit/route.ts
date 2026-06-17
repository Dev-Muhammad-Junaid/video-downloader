import { NextResponse } from "next/server";
import {
    trimVideo,
    cropVideo,
    trimAndCrop,
    burnSubtitles,
    trimBurnSubtitles,
    cropBurnSubtitles,
    trimCropBurnSubtitles,
    trimAudio,
    processAudio,
    convertToMp4,
    editImage,
} from "@/lib/media-editor";
import { createDefaultStyleConfig, type SubtitleStyleConfig } from "@/lib/ass-builder";

/** Merge a partial (or fully absent) styleConfig from the request with safe defaults. */
function resolveStyleConfig(raw?: Partial<SubtitleStyleConfig>): SubtitleStyleConfig {
    const preset = raw?.preset ?? "classic";
    return { ...createDefaultStyleConfig(preset), ...(raw ?? {}) };
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { videoId, action, params } = body;

        if (!videoId || !action) {
            return NextResponse.json({ error: "Missing required fields: videoId, action" }, { status: 400 });
        }

        let result;

        if (action === "trim") {
            const { startTime, endTime, inheritSrtContent } = params;
            if (startTime === undefined || endTime === undefined) {
                return NextResponse.json({ error: "Trim requires startTime and endTime" }, { status: 400 });
            }
            result = await trimVideo(videoId, startTime, endTime, inheritSrtContent);

        } else if (action === "crop") {
            const { w, h, x, y, inheritSrtContent } = params;
            if (w === undefined || h === undefined || x === undefined || y === undefined) {
                return NextResponse.json({ error: "Crop requires w, h, x, and y parameters" }, { status: 400 });
            }
            result = await cropVideo(videoId, w, h, x, y, inheritSrtContent);

        } else if (action === "trim-crop") {
            const { startTime, endTime, w, h, x, y, inheritSrtContent } = params;
            if (startTime === undefined || endTime === undefined ||
                w === undefined || h === undefined || x === undefined || y === undefined) {
                return NextResponse.json({ error: "trim-crop requires startTime, endTime, w, h, x, and y" }, { status: 400 });
            }
            result = await trimAndCrop(videoId, startTime, endTime, w, h, x, y, inheritSrtContent);

        } else if (action === "burn-subtitles") {
            const { srtContent, styleConfig: rawStyle, inheritSrtContent } = params;
            if (!srtContent) {
                return NextResponse.json({ error: "burn-subtitles requires srtContent" }, { status: 400 });
            }
            result = await burnSubtitles(
                videoId,
                srtContent,
                resolveStyleConfig(rawStyle),
                inheritSrtContent
            );

        } else if (action === "trim-audio") {
            const { startTime, endTime } = params;
            if (startTime === undefined || endTime === undefined) {
                return NextResponse.json({ error: "trim-audio requires startTime and endTime" }, { status: 400 });
            }
            result = await trimAudio(videoId, startTime, endTime);

        } else if (action === "process-audio") {
            // Unified audio editor: trim + format/bitrate + gain + normalize + fades + voice enhance.
            result = await processAudio(videoId, params || {});

        } else if (action === "trim-burn") {
            const { startTime, endTime, srtContent, styleConfig: rawStyle, inheritSrtContent } = params;
            if (startTime === undefined || endTime === undefined || !srtContent) {
                return NextResponse.json({ error: "trim-burn requires startTime, endTime, and srtContent" }, { status: 400 });
            }
            result = await trimBurnSubtitles(
                videoId,
                startTime,
                endTime,
                srtContent,
                resolveStyleConfig(rawStyle),
                inheritSrtContent
            );

        } else if (action === "crop-burn") {
            const { w, h, x, y, srtContent, styleConfig: rawStyle, inheritSrtContent } = params;
            if (w === undefined || h === undefined || x === undefined || y === undefined || !srtContent) {
                return NextResponse.json({ error: "crop-burn requires w, h, x, y, and srtContent" }, { status: 400 });
            }
            result = await cropBurnSubtitles(
                videoId,
                w, h, x, y,
                srtContent,
                resolveStyleConfig(rawStyle),
                inheritSrtContent
            );

        } else if (action === "trim-crop-burn") {
            const { startTime, endTime, w, h, x, y, srtContent, styleConfig: rawStyle, inheritSrtContent } = params;
            if (startTime === undefined || endTime === undefined || w === undefined || h === undefined ||
                x === undefined || y === undefined || !srtContent) {
                return NextResponse.json({ error: "trim-crop-burn requires all trim, crop, and subtitle params" }, { status: 400 });
            }
            result = await trimCropBurnSubtitles(
                videoId,
                startTime, endTime,
                w, h, x, y,
                srtContent,
                resolveStyleConfig(rawStyle),
                inheritSrtContent
            );

        } else if (action === "convert-mp4") {
            result = await convertToMp4(videoId);

        } else if (action === "image-edit") {
            const { crop, rotation, brightness, contrast, saturation, format, quality } = params;
            result = await editImage(videoId, { crop, rotation, brightness, contrast, saturation, format, quality });

        } else {
            return NextResponse.json({ error: "Invalid action." }, { status: 400 });
        }

        return NextResponse.json({ success: true, video: result });

    } catch (error: any) {
        console.error("Media Edit Error:", error);
        return NextResponse.json({ error: "Failed to edit media", details: error.message }, { status: 500 });
    }
}
