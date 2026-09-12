import { describe, it, expect } from "vitest";
import { keyframeAtOrBefore } from "@/lib/ffmpeg";

/**
 * The trim slider stepped in 0.1s, but a fast trim is a stream copy and can
 * only cut at a keyframe. Measured on a real download, keyframes sat 0.48s to
 * 6.6s apart — so a cut placed at 7.5s actually began at 6.8s, silently.
 *
 * The editor now snaps the handles to these positions, and offers a precise
 * (re-encoding) cut for when the exact frame matters.
 */

// Real keyframe timestamps from a YouTube download in the library.
const REAL = [0, 1.6, 6.8, 7.68, 13.04, 16.2, 21.4, 26.96, 29.12, 31.56, 33.56, 38.04];

/** Mirror of the snap used by the scrubber: nearest keyframe, not previous. */
const nearest = (keyframes: number[], t: number) =>
    keyframes.reduce((best, k) => (Math.abs(t - k) < Math.abs(t - best) ? k : best), keyframes[0]);

describe("keyframe-bound trimming", () => {
    it("reports where a stream copy really starts", () => {
        // The exact case that was silently wrong.
        expect(keyframeAtOrBefore(REAL, 7.5)).toBe(6.8);
        expect(keyframeAtOrBefore(REAL, 13.04)).toBe(13.04);
        expect(keyframeAtOrBefore(REAL, 30)).toBe(29.12);
    });

    it("never returns a keyframe after the requested time", () => {
        for (let t = 0; t <= 40; t += 0.37) {
            expect(keyframeAtOrBefore(REAL, t)).toBeLessThanOrEqual(t + 1e-6);
        }
    });

    it("falls back to the requested time when nothing is known", () => {
        // Probing can fail; snapping is then simply unavailable.
        expect(keyframeAtOrBefore([], 7.5)).toBe(7.5);
    });

    it("snapping moves a handle to a point the cut can honour", () => {
        for (const t of [7.5, 12.3, 30.7, 22.1]) {
            expect(REAL).toContain(nearest(REAL, t));
        }
    });

    it("snapping picks the closer side, not always the earlier one", () => {
        // 7.6 is nearer 7.68 than 6.8 — snapping down would move the cut
        // almost a second further than necessary.
        expect(nearest(REAL, 7.6)).toBe(7.68);
        expect(nearest(REAL, 7.0)).toBe(6.8);
    });

    it("a snapped handle is never further than half the largest gap", () => {
        const gaps = REAL.slice(1).map((k, i) => k - REAL[i]);
        const worst = Math.max(...gaps);
        for (let t = 0; t <= 38; t += 0.13) {
            expect(Math.abs(nearest(REAL, t) - t)).toBeLessThanOrEqual(worst / 2 + 1e-6);
        }
    });
});
