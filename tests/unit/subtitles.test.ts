import { describe, it, expect } from "vitest";
import { hexToAss, assToHex, rgbToAssBgr } from "@/lib/ass-color";
import { createDefaultStyleConfig, getPresetDefaults, BOX_STYLE_PRESETS } from "@/lib/ass-builder";

/**
 * ASS stores colour as &HAABBGGRR — alpha first, and the RGB channels
 * reversed. Getting the byte order wrong swaps red and blue, which looks
 * plausible enough in a preview to ship.
 */
describe("ASS colour conversion", () => {
    it("reverses RGB into BGR", () => {
        expect(rgbToAssBgr("#FF0000").toUpperCase()).toContain("0000FF");
        expect(rgbToAssBgr("#0000FF").toUpperCase()).toContain("FF0000");
    });

    it("keeps grey unchanged under reversal", () => {
        expect(rgbToAssBgr("#808080").toUpperCase()).toContain("808080");
    });

    it("round-trips a colour at full opacity", () => {
        expect(assToHex(hexToAss("#3366CC", 100)).toUpperCase()).toBe("#3366CC");
    });

    it("encodes opacity as inverted alpha", () => {
        // ASS alpha is transparency: 00 is opaque, FF is invisible.
        expect(hexToAss("#FFFFFF", 100).toUpperCase()).toContain("&H00");
        expect(hexToAss("#FFFFFF", 0).toUpperCase()).toContain("&HFF");
    });
});

describe("subtitle style presets", () => {
    it("produces a fully-populated config for every preset", () => {
        for (const preset of ["classic", "box", "bold-center"]) {
            const cfg = createDefaultStyleConfig(preset);
            expect(cfg.fontFamily).toBeTruthy();
            expect(cfg.fontSizeScale).toBeGreaterThan(0);
            expect(cfg.primaryColor).toMatch(/^#/);
            // Every field must be resolved, never left undefined — the ASS
            // builder interpolates these straight into the style line, so an
            // undefined would render as the literal string "undefined".
            for (const [key, value] of Object.entries(cfg)) {
                expect(value, `${preset}.${key} should be defined`).toBeDefined();
            }
        }
    });

    it("puts bold-center in the middle of frame and everything else at the bottom", () => {
        expect(createDefaultStyleConfig("bold-center").positionV).toBe("middle");
        expect(createDefaultStyleConfig("classic").positionV).toBe("bottom");
    });

    it("marks the boxed presets as boxed", () => {
        expect(BOX_STYLE_PRESETS.has("classic")).toBe(true);
        expect(BOX_STYLE_PRESETS.has("box")).toBe(true);
    });

    it("returns an object for an unknown preset rather than throwing", () => {
        expect(getPresetDefaults("does-not-exist")).toBeTypeOf("object");
    });
});
