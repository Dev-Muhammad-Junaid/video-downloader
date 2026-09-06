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

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Checks GitHub Releases for a newer version once on mount, then every few
 *  hours for as long as the app stays open. Update availability is a fact
 *  about the world, not per-viewer state — deliberately not persisted to
 *  localStorage, so the indicator can't be silently dismissed and forgotten;
 *  it goes away only once the user is actually on the new version. */
export function useUpdateCheck() {
    const [info, setInfo] = useState<UpdateInfo | null>(null);

    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            try {
                const res = await fetch("/api/check-update");
                if (!res.ok) return;
                const data: UpdateInfo = await res.json();
                if (!cancelled) setInfo(data);
            } catch {
                // Silent — an update check failing (offline, GitHub down) isn't
                // something worth interrupting the user over.
            }
        };

        check();
        const interval = setInterval(check, CHECK_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    return info;
}
