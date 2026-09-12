import { describe, it, expect } from "vitest";
import { videoAudioArgs, audioIsModified } from "@/lib/media-editor";

/**
 * Every video export path used to hardcode `-c:a copy`, so a video's audio was
 * untouchable — no way to change its level, let alone drop it. The ffmpeg
 * filter chain to do all of this already existed for audio-only files; it was
 * simply unreachable if the file had a video track.
 *
 * The property that matters most: doing nothing must stay a lossless copy, so
 * a plain trim is still instant.
 */
describe("audio on video exports", () => {
    it("copies the track untouched when nothing is asked for", () => {
        expect(videoAudioArgs()).toEqual(["-c:a", "copy"]);
        expect(videoAudioArgs({})).toEqual(["-c:a", "copy"]);
        expect(videoAudioArgs({ gainDb: 0, normalize: false })).toEqual(["-c:a", "copy"]);
        expect(audioIsModified()).toBe(false);
    });

    it("drops the track entirely when asked", () => {
        expect(videoAudioArgs({ removeAudio: true })).toEqual(["-an"]);
        expect(audioIsModified({ removeAudio: true })).toBe(true);
    });

    it("removing audio wins over any other setting", () => {
        // The UI hides gain when removing, but the backend must not depend on
        // the UI to avoid emitting a filter for a track that won't exist.
        expect(videoAudioArgs({ removeAudio: true, gainDb: 6, normalize: true })).toEqual(["-an"]);
    });

    it("applies gain, and re-encodes because filters need it", () => {
        const args = videoAudioArgs({ gainDb: -6 });
        expect(args).toContain("-af");
        expect(args.join(" ")).toContain("volume=-6dB");
        // A copied stream can't be filtered.
        expect(args).toContain("-c:a");
        expect(args).toContain("aac");
        expect(audioIsModified({ gainDb: -6 })).toBe(true);
    });

    it("applies loudness normalisation", () => {
        expect(videoAudioArgs({ normalize: true }).join(" ")).toContain("loudnorm");
    });

    it("combines gain and normalisation in one pass", () => {
        const chain = videoAudioArgs({ gainDb: 3, normalize: true }).join(" ");
        expect(chain).toContain("volume=3dB");
        expect(chain).toContain("loudnorm");
        // Gain before normalisation, or the normaliser just undoes it.
        expect(chain.indexOf("volume=")).toBeLessThan(chain.indexOf("loudnorm"));
    });

    it("negative and positive gain both survive", () => {
        expect(videoAudioArgs({ gainDb: -20 }).join(" ")).toContain("volume=-20dB");
        expect(videoAudioArgs({ gainDb: 12 }).join(" ")).toContain("volume=12dB");
    });
});
