import { describe, it, expect } from "vitest";
import { formatSize, formatDuration, formatBytes } from "@/lib/format";

describe("human-readable formatting", () => {
    it("scales byte units", () => {
        expect(formatBytes(0)).toMatch(/0/);
        expect(formatBytes(1024)).toMatch(/KB/i);
        expect(formatBytes(1024 ** 2)).toMatch(/MB/i);
        expect(formatBytes(1024 ** 3)).toMatch(/GB/i);
    });

    it("handles a missing size without printing NaN", () => {
        const out = formatSize(null);
        expect(out).toBeTruthy();
        expect(out).not.toMatch(/NaN/);
    });

    it("formats durations as clock time", () => {
        expect(formatDuration(65)).toBe("1:05");
        expect(formatDuration(599)).toBe("9:59");
    });

    it("rolls over into hours instead of counting past 60 minutes", () => {
        // REGRESSION: this returned "61:01" and "120:00" — minutes kept
        // accumulating, so any video over an hour read as nonsense.
        expect(formatDuration(3661)).toBe("1:01:01");
        expect(formatDuration(7200)).toBe("2:00:00");
    });

    it("handles a missing duration without printing NaN", () => {
        expect(formatDuration(null)).not.toMatch(/NaN/);
    });
});
