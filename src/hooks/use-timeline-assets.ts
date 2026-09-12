"use client";

import { useEffect, useState } from "react";

/**
 * Filmstrip and waveform for the timeline.
 *
 * Both are built server-side and cached per file, so this is a single fetch
 * each. Failure is deliberately silent — a missing strip or a video with no
 * audio just means the timeline draws without them, which is the behaviour it
 * had before they existed.
 */
export function useTimelineAssets(videoId: string | undefined, enabled: boolean) {
    const [peaks, setPeaks] = useState<number[]>([]);
    const [filmstripUrl, setFilmstripUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!videoId || !enabled) return;
        let cancelled = false;

        fetch(`/api/media/waveform?id=${encodeURIComponent(videoId)}`)
            .then((r) => (r.ok ? r.json() : { peaks: [] }))
            .then((d) => { if (!cancelled) setPeaks(Array.isArray(d.peaks) ? d.peaks : []); })
            .catch(() => { if (!cancelled) setPeaks([]); });

        // Probe rather than assign the URL directly, so a 404 (audio-only file,
        // unknown duration) doesn't leave a broken image in the track.
        const url = `/api/media/filmstrip?id=${encodeURIComponent(videoId)}`;
        fetch(url)
            .then((r) => { if (!cancelled) setFilmstripUrl(r.ok ? url : null); })
            .catch(() => { if (!cancelled) setFilmstripUrl(null); });

        return () => { cancelled = true; };
    }, [videoId, enabled]);

    return { peaks, filmstripUrl };
}
