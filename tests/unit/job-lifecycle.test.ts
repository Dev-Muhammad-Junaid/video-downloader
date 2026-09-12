import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Jobs must never silently vanish, and must never be able to swamp the machine.
 *
 * Two real incidents. A download of a video link carrying ?list= worked through
 * 552 playlist entries and neither completed nor reported an error — it just
 * stopped being in the UI. And exports bypassed the concurrency limiter that
 * downloads had always used, so two subtitle burns at once demanded ~950% CPU
 * on an 8-core machine and cooked the laptop.
 *
 * These read the source because the behaviour lives in module-level wiring that
 * can't be exercised without a database and live ffmpeg — but the wiring going
 * missing is exactly how both bugs happened.
 */

const read = (p: string) => fs.readFileSync(path.resolve(p), "utf-8");

describe("export concurrency", () => {
    const runner = read("src/lib/export-runner.ts");

    it("exports go through a limiter", () => {
        // Downloads were capped at 3; exports fired a bare async call.
        expect(runner).toContain("pLimit");
        expect(runner).toMatch(/exportLimit\(/);
    });

    it("the cap is small enough to leave the machine usable", () => {
        // The argument can contain a call of its own, so take the whole line.
        const line = runner.split("\n").find((l) => l.includes("pLimit("));
        expect(line, "no pLimit(...) call found").toBeDefined();
        // Hardware encode shares one media engine; software asks for most of
        // the CPU. Either way this must stay a small number, not unbounded.
        const numbers = (line!.match(/\d+/g) ?? []).map(Number);
        expect(numbers.length).toBeGreaterThan(0);
        expect(Math.max(...numbers)).toBeLessThanOrEqual(3);
    });

    it("a queued export reports itself as queued, not as encoding at 0%", () => {
        expect(runner).toContain("markExportRunning");
        const manager = read("src/lib/download-manager.ts");
        expect(manager).toContain("markExportRunning");
    });
});

describe("downloads reach a terminal state", () => {
    const manager = read("src/lib/download-manager.ts");

    it("a failed spawn is recorded as an error, not left hanging", () => {
        expect(manager).toMatch(/ytdlp\.on\("error"/);
        expect(manager).toMatch(/status:\s*"error"/);
    });

    it("failures are written to the history log so nothing disappears silently", () => {
        expect(manager).toContain("downloadLog.update");
        expect(manager).toContain("errorMessage");
    });

    it("a single-video link cannot expand into a playlist download", () => {
        // The 552-entry Radio mix.
        expect(manager).toContain("playlistScopeArgs");
    });
});

describe("encoder settings stay off the CPU", () => {
    const encoder = read("src/lib/encoder.ts");

    it("never reintroduces the preset that pinned ~477% CPU", () => {
        expect(encoder).not.toMatch(/"veryslow"/);
        expect(encoder).not.toMatch(/x264Preset:\s*"slow"/);
    });

    it("asks for hardware decode as well as hardware encode", () => {
        // Software H.264 decode alone cost ~63% CPU and dominated the export.
        expect(encoder).toContain("hwaccel");
        expect(encoder).toContain("videotoolbox");
    });

    it("the software fallback caps threads", () => {
        expect(encoder).toContain("-threads");
    });
});
