// Single source of truth for ASS colour conversion. Pure and dependency-free
// (leaf module) so both ass-builder.ts and subtitle-types.ts can import it
// without creating a cycle.

/** "#RRGGBB" + opacity 0–100 → ASS "&HAABBGGRR". */
export function hexToAss(hex: string, opacity = 100): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const alpha = Math.round((1 - Math.max(0, Math.min(100, opacity)) / 100) * 255);
    const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    return `&H${h(alpha)}${h(b)}${h(g)}${h(r)}`;
}

/** ASS "&HAABBGGRR" → hex "#RRGGBB" (discards alpha). */
export function assToHex(assColor: string): string {
    const m = assColor.match(/&H[0-9A-Fa-f]{2}([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/i);
    if (!m) return "#FFFFFF";
    const [, bb, gg, rr] = m;
    return `#${rr}${gg}${bb}`.toUpperCase();
}

/** "#RRGGBB" → ASS "&H00BBGGRR&" (opaque, for inline \1c/\3c override tags). */
export function rgbToAssBgr(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    return `&H00${h(b)}${h(g)}${h(r)}&`;
}
