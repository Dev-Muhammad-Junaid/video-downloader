// Single source of truth for time parsing/formatting across the app.
// Pure and dependency-free, so it's safe to import on both client and server.

/**
 * Parse a flexible time value to seconds. Accepts a number (returned as-is),
 * "HH:MM:SS", "MM:SS", or a plain numeric string ("12.5").
 */
export function parseTimeToSeconds(time: string | number): number {
    if (typeof time === "number") return time;
    const s = String(time ?? "");
    if (s.includes(":")) {
        const parts = s.split(":").map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return parseFloat(s) || 0;
}

/** Parse an SRT time string "HH:MM:SS,mmm" to seconds. */
export function parseSrtTime(timeStr: string): number {
    if (!timeStr) return 0;
    const [h, m, s_ms] = timeStr.split(":");
    if (!s_ms) return 0;
    const [s, ms] = s_ms.split(",");
    return (
        parseInt(h) * 3600 +
        parseInt(m) * 60 +
        parseInt(s) +
        parseInt(ms || "0") / 1000
    );
}

/** Format seconds to an SRT time string "HH:MM:SS,mmm". */
export function formatSrtTime(seconds: number): string {
    const totalMs = Math.round(Math.max(0, seconds) * 1000);
    const ms = totalMs % 1000;
    const totalSecs = Math.floor(totalMs / 1000);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Convert an SRT time string "HH:MM:SS,mmm" to ASS "H:MM:SS.cc" (centiseconds). */
export function srtTimeToAss(srtTime: string): string {
    const [hms = "", msStr = "0"] = srtTime.trim().split(",");
    const [hh = "0", mm = "00", ss = "00"] = hms.split(":");
    // Use Math.floor (not Math.round) so 999ms → 99cs, not 100cs (overflow)
    const cs = Math.min(99, Math.floor(parseInt(msStr) / 10));
    return `${parseInt(hh)}:${mm}:${ss}.${String(cs).padStart(2, "0")}`;
}

/** Format seconds to a compact clock "M:SS" (e.g. playback display). */
export function formatClock(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** Display-friendly "M:SS" from an SRT time string. */
export function displayTime(srtTime: string): string {
    return formatClock(parseSrtTime(srtTime));
}

/** Shift an SRT time string by `deltaMs` milliseconds (clamped at 0). */
export function shiftTime(timeStr: string, deltaMs: number): string {
    return formatSrtTime(Math.max(0, parseSrtTime(timeStr) + deltaMs / 1000));
}
