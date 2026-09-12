"use client";

import { useEffect, useState } from "react";

export interface UpdateInfo {
    currentVersion: string;
    latestVersion?: string;
    updateAvailable: boolean;
    changelog?: string;
    releaseUrl?: string;
    downloadUrl?: string;
    publishedAt?: string;
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Checks GitHub Releases for a newer version: on mount, whenever the window
 * regains focus, and periodically while the app stays open.
 *
 * The focus check is the one that matters in practice. A desktop app is often
 * left running for days, and the previous six-hourly poll — on top of an hour
 * of server-side caching — meant a new release could stay invisible for seven
 * hours while the app insisted it was up to date. Coming back to the window is
 * exactly the moment someone might look for an update.
 *
 * Update availability is a fact about the world, not per-viewer state —
 * deliberately not persisted to localStorage, so the indicator can't be
 * silently dismissed and forgotten; it goes away only once the user is
 * actually on the new version.
 */
export function useUpdateCheck() {
    const [info, setInfo] = useState<UpdateInfo | null>(null);

    useEffect(() => {
        let cancelled = false;

        const check = async (force = false) => {
            try {
                const res = await fetch(`/api/check-update${force ? "?force=1" : ""}`);
                if (!res.ok) return;
                const data: UpdateInfo = await res.json();
                if (!cancelled) setInfo(data);
            } catch {
                // Silent — an update check failing (offline, GitHub down) isn't
                // something worth interrupting the user over.
            }
        };

        void check();
        const interval = setInterval(() => void check(), CHECK_INTERVAL_MS);

        // Returning to the app re-checks, bypassing the cache — otherwise the
        // answer can be up to CACHE_SECONDS old at the moment someone looks.
        const onFocus = () => void check(true);
        window.addEventListener("focus", onFocus);

        return () => {
            cancelled = true;
            clearInterval(interval);
            window.removeEventListener("focus", onFocus);
        };
    }, []);

    return info;
}
