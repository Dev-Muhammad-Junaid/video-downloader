import { describe, it, expect } from "vitest";
import { videoAudioArgs, scaleFilter, joinFilters, outputExtension } from "@/lib/media-editor";

/**
 * Export output options: container, resolution and whether audio survives.
 *
 * Trims always re-encode now, so there is no stream-copy path to protect and
 * no keyframe snapping — a cut lands exactly where it is placed. What needs
 * guarding instead is that these options compose correctly with the crop and
 * subtitle filters that were already there.
 */
describe("export output options", () => {
    it("keeps the audio track by default and drops it on request", () => {
        expect(videoAudioArgs()).toEqual(["-c:a", "copy"]);
        expect(videoAudioArgs({})).toEqual(["-c:a", "copy"]);
        expect(videoAudioArgs({ removeAudio: false })).toEqual(["-c:a", "copy"]);
        expect(videoAudioArgs({ removeAudio: true })).toEqual(["-an"]);
    });

    it("leaves the frame alone unless a resolution is chosen", () => {
        expect(scaleFilter()).toBe("");
        expect(scaleFilter("original")).toBe("");
    });

    it("scales down only — never upscales a smaller source", () => {
        // min(ih, target) is what stops 1080p being requested of a 720p file
        // and producing a blurry, larger upscale.
        for (const r of ["1080", "720", "480"] as const) {
            const f = scaleFilter(r);
            expect(f).toContain(`min(ih,${r})`);
        }
    });

    it("keeps width even, which H.264 requires", () => {
        // -1 preserves aspect but can land on an odd width and fail the encode.
        expect(scaleFilter("720")).toContain("scale=-2:");
        expect(scaleFilter("720")).not.toContain("scale=-1:");
    });

    it("composes with crop and subtitle filters without empty segments", () => {
        const chain = joinFilters("crop=100:100:0:0", "subtitles=x.ass", scaleFilter("720"));
        expect(chain).toBe("crop=100:100:0:0,subtitles=x.ass,scale=-2:'min(ih,720)'");
        expect(chain).not.toContain(",,");
    });

    it("drops empty filters rather than emitting a trailing comma", () => {
        // An empty segment makes ffmpeg reject the whole -vf argument.
        expect(joinFilters("crop=1:1:0:0", "", undefined)).toBe("crop=1:1:0:0");
        expect(joinFilters(undefined, scaleFilter("original"))).toBe("");
    });

    it("keeps the source extension unless a format is chosen", () => {
        expect(outputExtension("/a/b/clip.mkv")).toBe(".mkv");
        expect(outputExtension("/a/b/clip.mkv", "original")).toBe(".mkv");
        expect(outputExtension("/a/b/clip.mkv", "mp4")).toBe(".mp4");
        expect(outputExtension("/a/b/clip.mp4", "mov")).toBe(".mov");
    });
});
