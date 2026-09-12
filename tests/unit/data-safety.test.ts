import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression suite for the failures that actually destroyed or hid user data.
 *
 * Every case here is something that happened, not something imagined. The
 * bundle-path mistake alone shipped five separate times before anything caught
 * it, so these assert behaviour at the seams where the damage occurred rather
 * than re-testing pure helpers.
 */

const videos = vi.hoisted(() => ({ findMany: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { video: videos } }));

const access = vi.hoisted(() => vi.fn());
vi.mock("fs/promises", () => ({ default: { access }, access }));

async function loadLibraryRoute() {
    vi.resetModules();
    return import("@/app/api/library/route");
}

const row = (id: string, localPath: string) => ({
    id, localPath, title: id, labels: [], createdAt: new Date(),
});

describe("library listing never destroys entries", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        access.mockReset();
    });

    it("keeps an entry whose file is unreachable, and flags it", async () => {
        // The exact shape of the data loss: media on an unplugged drive, or
        // deleted by an app update, was permanently removed from the library on
        // the next load — silently, in the background, with no undo.
        videos.findMany.mockResolvedValue([row("gone", "/Volumes/Unplugged/clip.mp4")]);
        access.mockRejectedValue(new Error("ENOENT"));

        const { GET } = await loadLibraryRoute();
        const body = await (await GET()).json();

        expect(videos.deleteMany).not.toHaveBeenCalled();
        expect(body).toHaveLength(1);
        expect(body[0].fileMissing).toBe(true);
    });

    it("does not delete even when every single file is missing", async () => {
        // What an app update used to cause: the whole library at once.
        videos.findMany.mockResolvedValue(
            Array.from({ length: 50 }, (_, i) => row(`v${i}`, `/Applications/SnapDown.app/Contents/x${i}.mp4`)),
        );
        access.mockRejectedValue(new Error("ENOENT"));

        const { GET } = await loadLibraryRoute();
        const body = await (await GET()).json();

        expect(videos.deleteMany).not.toHaveBeenCalled();
        expect(body).toHaveLength(50);
        expect(body.every((v: { fileMissing: boolean }) => v.fileMissing)).toBe(true);
    });

    it("marks reachable files as present", async () => {
        videos.findMany.mockResolvedValue([row("here", "/Users/jd/Movies/SnapDown/clip.mp4")]);
        access.mockResolvedValue(undefined);

        const { GET } = await loadLibraryRoute();
        const body = await (await GET()).json();

        expect(body[0].fileMissing).toBe(false);
        expect(videos.deleteMany).not.toHaveBeenCalled();
    });

    it("reports a mixed library accurately", async () => {
        videos.findMany.mockResolvedValue([
            row("ok", "/Users/jd/Movies/SnapDown/a.mp4"),
            row("missing", "/Volumes/Gone/b.mp4"),
        ]);
        access.mockImplementation(async (p: string) => {
            if (String(p).includes("/Volumes/Gone")) throw new Error("ENOENT");
        });

        const { GET } = await loadLibraryRoute();
        const body = await (await GET()).json();

        expect(body.find((v: { id: string }) => v.id === "ok").fileMissing).toBe(false);
        expect(body.find((v: { id: string }) => v.id === "missing").fileMissing).toBe(true);
        expect(videos.deleteMany).not.toHaveBeenCalled();
    });
});
