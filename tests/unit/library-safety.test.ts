import { describe, it, expect } from "vitest";
import { isInsideAppBundle } from "@/lib/app-paths";

/**
 * The update that wiped a library did it in two steps: media lived inside
 * SnapDown.app so the update deleted it, then the library listing permanently
 * removed every row whose file it couldn't stat. These pin the guard that
 * stops step one.
 */
describe("app-bundle path detection", () => {
    it("recognises the packaged download folder that updates destroy", () => {
        expect(isInsideAppBundle("/Applications/SnapDown.app/Contents/Resources/standalone/downloads")).toBe(true);
        expect(isInsideAppBundle("/Applications/SnapDown.app/Contents/Resources/standalone/downloads/clip.mp4")).toBe(true);
    });

    it("allows ordinary user locations", () => {
        expect(isInsideAppBundle("/Users/jd/Movies/SnapDown")).toBe(false);
        expect(isInsideAppBundle("/Users/jd/Downloads/snapdown-downloads")).toBe(false);
        expect(isInsideAppBundle("/Volumes/External/media")).toBe(false);
    });

    it("is not fooled by a folder merely named like an app", () => {
        // ".app" alone is not the bundle marker — "Contents/" must follow.
        expect(isInsideAppBundle("/Users/jd/my.app-notes/media")).toBe(false);
    });

    it("resolves relative paths before judging", () => {
        expect(isInsideAppBundle("/Applications/SnapDown.app/Contents/../Contents/Resources")).toBe(true);
    });
});
