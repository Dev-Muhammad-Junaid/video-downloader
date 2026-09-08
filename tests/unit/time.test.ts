import { describe, it, expect } from "vitest";
import { parseSrtTime, formatSrtTime, srtTimeToAss, shiftTime, parseTimeToSeconds } from "@/lib/time";

/**
 * Subtitle timing. An off-by-one here desyncs every caption in an export, and
 * it's the kind of thing that survives a visual check.
 */
describe("subtitle time conversion", () => {
    it("round-trips an SRT timestamp", () => {
        const t = "00:01:02,500";
        expect(formatSrtTime(parseSrtTime(t))).toBe(t);
    });

    it("parses SRT into seconds", () => {
        expect(parseSrtTime("00:00:01,000")).toBeCloseTo(1);
        expect(parseSrtTime("01:00:00,000")).toBeCloseTo(3600);
        expect(parseSrtTime("00:01:30,250")).toBeCloseTo(90.25);
    });

    it("converts SRT to ASS centisecond form", () => {
        // ASS uses h:mm:ss.cc — one fewer digit than SRT's milliseconds.
        expect(srtTimeToAss("00:01:02,500")).toBe("0:01:02.50");
    });

    it("shifts a timestamp forwards and backwards", () => {
        expect(shiftTime("00:00:10,000", 500)).toBe("00:00:10,500");
        expect(shiftTime("00:00:10,000", -1000)).toBe("00:00:09,000");
    });

    it("clamps a negative shift at zero rather than going negative", () => {
        expect(parseSrtTime(shiftTime("00:00:00,500", -5000))).toBeGreaterThanOrEqual(0);
    });

    it("accepts numbers and clock strings, which is what the editor passes", () => {
        expect(parseTimeToSeconds(12.5)).toBeCloseTo(12.5);
        expect(parseTimeToSeconds("00:00:12")).toBeCloseTo(12);
        expect(parseTimeToSeconds("01:30")).toBeCloseTo(90);
        expect(parseTimeToSeconds("12.5")).toBeCloseTo(12.5);
    });

    it("does not accept SRT's comma-milliseconds — that's parseSrtTime's job", () => {
        // Pinning the boundary deliberately: the two parsers look
        // interchangeable at a glance, and feeding an SRT string to this one
        // yields NaN rather than throwing, which would silently poison a trim
        // duration. Callers today only pass editor clock values.
        expect(Number.isNaN(parseTimeToSeconds("00:00:12,500"))).toBe(true);
        expect(parseSrtTime("00:00:12,500")).toBeCloseTo(12.5);
    });
});
