"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type UpdatePhase = "idle" | "locating" | "downloading" | "verifying" | "installing" | "error";

/**
 * Drives the desktop app's in-app update.
 *
 * Only available inside the Electron shell — in a browser `window.snapdown` is
 * undefined and callers fall back to the manual download link.
 *
 * The renderer deliberately has no say in WHAT gets downloaded; it can only
 * ask the main process to update, and watch it happen.
 */
export function useInAppUpdate() {
    const [phase, setPhase] = useState<UpdatePhase>("idle");
    const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Whether the desktop bridge exists is fixed for the lifetime of the page,
    // so the subscription is a no-op; useSyncExternalStore is here for the
    // server snapshot, which keeps the first client render matching the
    // server's and hydration clean.
    const available = useSyncExternalStore(
        () => () => {},
        () => !!window.snapdown?.update,
        () => false,
    );

    useEffect(() => {
        const api = typeof window !== "undefined" ? window.snapdown?.update : undefined;
        if (!api) return;
        const offStatus = api.onStatus((s) => setPhase(s.phase as UpdatePhase));
        const offProgress = api.onProgress((p) => setProgress(p));
        return () => { offStatus(); offProgress(); };
    }, []);

    const install = useCallback(async () => {
        const api = window.snapdown?.update;
        if (!api) return;
        setError(null);
        setPhase("locating");
        try {
            await api.install();
            // The app quits itself from here — the installer is waiting for
            // this process to exit before it swaps the bundle.
        } catch (err) {
            setPhase("error");
            setError(err instanceof Error ? err.message : "The update failed.");
        }
    }, []);

    return { available, phase, progress, error, install };
}
