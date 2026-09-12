import { describe, it, expect } from "vitest";
import { urlTargetsSingleVideo, playlistScopeArgs } from "@/lib/ytdlp";

/**
 * A pasted video link that carried ?list= started a PLAYLIST download.
 * YouTube attaches a list parameter to nearly every link it generates, and
 * auto-generated Mix/Radio lists are effectively endless — the reported URL
 * expanded to 552 entries, all written to the single output path the job
 * expected, so the download never produced the video and appeared to vanish.
 */
describe("playlist scoping", () => {
    it("treats a video link with a Radio/Mix list as a single video", () => {
        // The exact URL that failed.
        const url = "https://youtu.be/x6_mbnsh6VU?list=RDx6_mbnsh6VU";
        expect(urlTargetsSingleVideo(url)).toBe(true);
        expect(playlistScopeArgs(url)).toEqual(["--no-playlist"]);
    });

    it("handles the usual single-video shapes", () => {
        for (const url of [
            "https://www.youtube.com/watch?v=abc123",
            "https://www.youtube.com/watch?v=abc123&list=PLsomething&index=4",
            "https://youtu.be/abc123",
            "https://www.youtube.com/shorts/abc123",
            "https://www.youtube.com/live/abc123",
            "https://youtube.com/embed/abc123",
        ]) {
            expect(urlTargetsSingleVideo(url), url).toBe(true);
        }
    });

    it("leaves real playlists as playlists", () => {
        for (const url of [
            "https://www.youtube.com/playlist?list=PLabc",
            "https://youtube.com/playlist?list=RDabc",
        ]) {
            expect(urlTargetsSingleVideo(url), url).toBe(false);
            expect(playlistScopeArgs(url)).toEqual([]);
        }
    });

    it("does not override an explicitly chosen playlist item", () => {
        // The user picked one entry out of a playlist in the UI; that path
        // selects the item itself and must not be forced to --no-playlist.
        const url = "https://www.youtube.com/watch?v=abc&list=PLx&snapdown_playlist_item=3";
        expect(urlTargetsSingleVideo(url)).toBe(false);
    });

    it("ignores non-YouTube and malformed URLs rather than guessing", () => {
        expect(urlTargetsSingleVideo("https://vimeo.com/12345")).toBe(false);
        expect(urlTargetsSingleVideo("not a url")).toBe(false);
        expect(urlTargetsSingleVideo("")).toBe(false);
    });

    it("bare youtu.be with no id is not a video", () => {
        expect(urlTargetsSingleVideo("https://youtu.be/")).toBe(false);
    });
});
