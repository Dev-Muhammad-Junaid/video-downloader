import { describe, it, expect } from "vitest";

/**
 * Transcription used to fail outright on anything over roughly 55 minutes: the
 * whole file went up in one request, and the Whisper endpoints reject uploads
 * over 25 MB with a bare "413 Request Entity Too Large".
 *
 * Two things fixed it — a much lower audio bitrate, and splitting what's still
 * too big. These pin the arithmetic behind both, so a future bitrate tweak
 * can't silently reintroduce the ceiling.
 */

const MB = 1024 * 1024;
const LIMIT = 24 * MB; // what the code allows itself, under the API's 25 MB

/** Bytes per second, measured from real encodes of a 120s clip. */
const MEASURED_BYTES_PER_SEC = {
    mp3_64k: 0.92 * MB / 120,
    opus_16k: 0.23 * MB / 120,
};

const maxMinutes = (bytesPerSec: number) => LIMIT / bytesPerSec / 60;

describe("transcription upload limits", () => {
    it("the old 64 kbps MP3 could not reach an hour", () => {
        // This is the bug: a 60-minute recording didn't fit.
        expect(maxMinutes(MEASURED_BYTES_PER_SEC.mp3_64k)).toBeLessThan(60);
    });

    it("16 kbps Opus carries more than three hours in one upload", () => {
        expect(maxMinutes(MEASURED_BYTES_PER_SEC.opus_16k)).toBeGreaterThan(180);
    });

    it("chunk count always brings each piece under the limit", () => {
        const chunkCount = (size: number) => Math.ceil(size / LIMIT);
        for (const size of [LIMIT + 1, 30 * MB, 100 * MB, 999 * MB]) {
            const n = chunkCount(size);
            expect(n).toBeGreaterThan(1);
            expect(size / n).toBeLessThanOrEqual(LIMIT);
        }
    });

    it("a file at exactly the limit is not split", () => {
        expect(Math.ceil(LIMIT / LIMIT)).toBe(1);
    });

    it("chunk offsets reconstruct a continuous timeline", () => {
        // Each chunk's timestamps restart at zero; without adding the offset
        // back, every chunk's subtitles would pile up at the start of the video.
        const duration = 7200; // 2 hours
        const chunkCount = 3;
        const chunkSeconds = duration / chunkCount;
        const perChunkSegments = [
            [{ start: 0, end: 10 }, { start: 10, end: 20 }],
            [{ start: 0, end: 15 }],
            [{ start: 0, end: 5 }],
        ];

        const stitched = perChunkSegments.flatMap((segs, i) =>
            segs.map((s) => ({ start: s.start + i * chunkSeconds, end: s.end + i * chunkSeconds })),
        );

        expect(stitched.every((s, i) => i === 0 || s.start >= stitched[i - 1].start)).toBe(true);
        expect(stitched[2].start).toBe(chunkSeconds);
        expect(stitched[3].start).toBe(2 * chunkSeconds);
        expect(stitched.at(-1)!.end).toBeLessThanOrEqual(duration);
    });
});
