"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Keyframe positions for a video, used to snap the trim handles.
 *
 * A fast (stream-copy) trim can only cut at a keyframe. Without this the
 * slider offered 0.1s steps and the export quietly moved the cut to wherever
 * the nearest keyframe was — measured at 0.5 to 6 seconds away on a real
 * download. Snapping makes the limit visible instead of surprising.
 *
 * Failure is not surfaced: if the probe fails the editor simply doesn't snap,
 * which is the previous behaviour rather than a broken one.
 */
export function useKeyframes(videoId: string | undefined, enabled: boolean) {
    const [keyframes, setKeyframes] = useState<number[]>([]);

    useEffect(() => {
        if (!videoId || !enabled) return;
        let cancelled = false;

        fetch(`/api/media/keyframes?id=${encodeURIComponent(videoId)}`)
            .then((r) => (r.ok ? r.json() : { keyframes: [] }))
            .then((d) => { if (!cancelled) setKeyframes(Array.isArray(d.keyframes) ? d.keyframes : []); })
            .catch(() => { if (!cancelled) setKeyframes([]); });

        return () => { cancelled = true; };
    }, [videoId, enabled]);

    /** Nearest keyframe to `time`, or `time` itself when none are known. */
    const snap = useCallback((time: number): number => {
        if (keyframes.length === 0) return time;
        let best = keyframes[0];
        let bestGap = Math.abs(time - best);
        for (const k of keyframes) {
            const gap = Math.abs(time - k);
            if (gap < bestGap) { best = k; bestGap = gap; }
            if (k > time && gap > bestGap) break;
        }
        return best;
    }, [keyframes]);

    return { keyframes, snap, available: keyframes.length > 0 };
}
