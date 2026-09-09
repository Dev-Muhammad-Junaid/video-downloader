import { describe, it, expect, vi, beforeEach } from "vitest";
import os from "os";

/**
 * These pin the *shape* of the encoder args rather than exact quality numbers,
 * except where a number carries meaning:
 *
 *  - Hardware encoding must be selected when VideoToolbox is available. This is
 *    the whole point of the change: the old hardcoded `libx264 -preset slow`
 *    pinned ~477% CPU on an M1 Pro, enough to overheat the machine.
 *  - Hardware DECODING must be requested too. Software H.264 decode alone costs
 *    ~63% CPU and dominates an otherwise hardware-accelerated export.
 *  - The tiers must stay ordered, so "Maximum" can never silently produce worse
 *    output than "Fast".
 *  - The software fallback must cap threads, so a non-Apple machine can't be
 *    driven to 100% either.
 */

const mockSpawnSync = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ spawnSync: mockSpawnSync }));
vi.mock("@/lib/ffmpeg", () => ({ getFfmpegPath: () => "/fake/ffmpeg" }));

const withEncoders = (list: string) => {
    mockSpawnSync.mockReturnValue({ stdout: list, stderr: "" });
};

async function freshImport() {
    vi.resetModules();
    return import("@/lib/encoder");
}

describe("encoder selection", () => {
    beforeEach(() => {
        mockSpawnSync.mockReset();
        vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    });

    it("uses the VideoToolbox media engine when ffmpeg reports it", async () => {
        withEncoders(" V..... h264_videotoolbox    VideoToolbox H.264 Encoder");
        const { videoEncoderArgs, decodeArgs, hasHardwareEncoder } = await freshImport();

        expect(hasHardwareEncoder()).toBe(true);
        expect(videoEncoderArgs("balanced")).toContain("h264_videotoolbox");
        expect(videoEncoderArgs("balanced")).not.toContain("libx264");
        // Hardware decode matters as much as hardware encode.
        expect(decodeArgs()).toEqual(["-hwaccel", "videotoolbox"]);
    });

    it("keeps the tiers ordered so Maximum is never worse than Fast", async () => {
        withEncoders(" V..... h264_videotoolbox");
        const { videoEncoderArgs } = await freshImport();

        const q = (tier: "fast" | "balanced" | "maximum") => {
            const args = videoEncoderArgs(tier);
            return Number(args[args.indexOf("-q:v") + 1]);
        };
        expect(q("fast")).toBeLessThan(q("balanced"));
        expect(q("balanced")).toBeLessThan(q("maximum"));
    });

    it("falls back to software x264 with a thread cap when there is no media engine", async () => {
        withEncoders(" V..... libx264    libx264 H.264 encoder");
        const { videoEncoderArgs, decodeArgs, hasHardwareEncoder } = await freshImport();

        expect(hasHardwareEncoder()).toBe(false);
        const args = videoEncoderArgs("balanced");
        expect(args).toContain("libx264");
        // A capped thread count is what stops the fallback pinning every core.
        const threads = Number(args[args.indexOf("-threads") + 1]);
        expect(threads).toBeGreaterThan(0);
        expect(threads).toBeLessThan(os.cpus().length);
        // No hwaccel flag when there's no hardware to accelerate with.
        expect(decodeArgs()).toEqual([]);
    });

    it("never re-introduces the CPU-pinning preset that caused the overheating", async () => {
        withEncoders(" V..... libx264");
        const { videoEncoderArgs } = await freshImport();
        for (const tier of ["fast", "balanced", "maximum"] as const) {
            const args = videoEncoderArgs(tier);
            expect(args).not.toContain("slow");
            expect(args).not.toContain("veryslow");
            // CRF 16 on already-compressed source spends its bitrate preserving
            // the source's own artifacts — 2.6x the file size for no visible gain.
            const crf = Number(args[args.indexOf("-crf") + 1]);
            expect(crf).toBeGreaterThanOrEqual(18);
        }
    });

    it("does not probe for hardware on non-Apple platforms", async () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("win32");
        withEncoders(" V..... h264_videotoolbox");
        const { hasHardwareEncoder } = await freshImport();

        expect(hasHardwareEncoder()).toBe(false);
        expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it("treats an unknown tier as the default rather than throwing", async () => {
        withEncoders(" V..... h264_videotoolbox");
        const { videoEncoderArgs, isExportQuality } = await freshImport();

        expect(isExportQuality("nonsense")).toBe(false);
        // @ts-expect-error — deliberately passing an invalid tier
        expect(() => videoEncoderArgs("nonsense")).not.toThrow();
    });
});
