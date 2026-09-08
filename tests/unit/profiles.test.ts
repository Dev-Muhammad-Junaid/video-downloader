import { describe, it, expect } from "vitest";
import { getResolutionConstraint, getYtDlpFormat } from "@/lib/profiles";

/**
 * The format cascade decides what yt-dlp is actually asked to download, so a
 * mistake here doesn't throw — it just quietly fetches the wrong thing, or
 * nothing at all.
 */
describe("getResolutionConstraint", () => {
    it("returns no constraint when the profile doesn't cap resolution", () => {
        expect(getResolutionConstraint(null)).toBe("");
        expect(getResolutionConstraint("best")).toBe("");
    });

    it("uses an optional comparison for a ceiling", () => {
        // REGRESSION: a plain "[height<=1080]" evaluates false for a format
        // whose height is unknown, so yt-dlp discards it. Combined with the
        // deliberate absence of a /best fallback under a ceiling, that made
        // every direct media URL fail with "Requested format is not available"
        // — including everything the browser extension sends.
        expect(getResolutionConstraint("1080p", "flexible")).toBe("[height<=?1080]");
    });

    it("keeps strict and minimum modes exact", () => {
        expect(getResolutionConstraint("720p", "strict")).toBe("[height=720]");
        expect(getResolutionConstraint("720p", "minimum")).toBe("[height>=720]");
    });

    it("ignores non-numeric resolutions", () => {
        expect(getResolutionConstraint("auto")).toBe("");
    });
});

describe("getYtDlpFormat", () => {
    const base = { maxResolution: null, preferredFormat: "mp4" };

    it("ends an uncapped cascade with a plain best fallback", () => {
        const { args } = getYtDlpFormat(base);
        const selector = args[args.indexOf("-f") + 1];
        expect(selector.split("/").at(-1)).toBe("best");
    });

    it("does not append an unconditional best when a ceiling is set", () => {
        // Otherwise yt-dlp escalates past the cap the user asked for.
        const { args } = getYtDlpFormat({ ...base, maxResolution: "720p", resolutionMode: "flexible" });
        const selector = args[args.indexOf("-f") + 1];
        expect(selector.split("/")).not.toContain("best");
        expect(selector).toContain("[height<=?720]");
    });

    it("switches to audio extraction for an audio-only profile", () => {
        const { args, isAudio } = getYtDlpFormat({ ...base, extractAudio: true, audioFormat: "mp3" });
        expect(isAudio).toBe(true);
        expect(args).toContain("-x");
        expect(args).toContain("--audio-format");
    });

    it("treats wav as lossless and drops the bitrate flag", () => {
        const { args } = getYtDlpFormat({ ...base, extractAudio: true, audioFormat: "wav" });
        expect(args).toContain("wav");
        expect(args).not.toContain("--audio-quality");
    });

    it("honours an explicit format id from the picker", () => {
        const { args } = getYtDlpFormat(base, "137");
        expect(args[args.indexOf("-f") + 1]).toBe("137+bestaudio/best");
    });
});
