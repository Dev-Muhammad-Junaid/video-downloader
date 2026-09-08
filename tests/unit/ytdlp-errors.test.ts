import { describe, it, expect } from "vitest";
import { describeYtdlpError } from "@/lib/ytdlp";

/**
 * These classifications are what a user sees when a download fails. Getting
 * them wrong sends people hunting in the wrong place — the bot-check case in
 * particular is fixed in Settings, not by retrying.
 */
describe("describeYtdlpError", () => {
    it("points the bot-check at the cookie setting", () => {
        const stderr = 'ERROR: [youtube] abc: Sign in to confirm you’re not a bot. Use --cookies-from-browser';
        const msg = describeYtdlpError(stderr);
        expect(msg.toLowerCase()).toContain("cookie");
    });

    it("recognises a private video", () => {
        expect(describeYtdlpError("ERROR: [youtube] xyz: Private video").toLowerCase()).toContain("private");
    });

    it("recognises an unavailable video", () => {
        expect(describeYtdlpError("ERROR: [youtube] xyz: Video unavailable")).toBeTruthy();
    });

    it("falls back to yt-dlp's own message when unrecognised", () => {
        const msg = describeYtdlpError("ERROR: something oddly specific went wrong");
        expect(msg).toContain("something oddly specific");
    });

    it("returns empty for noise, so the caller can use its own wording", () => {
        expect(describeYtdlpError("[download] 12.3% of 5MiB")).toBe("");
        expect(describeYtdlpError("")).toBe("");
    });
});
