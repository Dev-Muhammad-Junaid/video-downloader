"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type UpdatePhase =
    | "idle"
    | "locating"
    | "downloading"
    | "verifying"
    | "ready"       // downloaded and verified, waiting for the user to restart
    | "installing"
    | "error";

/**
 * Drives the desktop app's in-app update.
 *
 * Downloading and restarting are separate steps on purpose: the install
 * replaces the app and quits it, so that has to be the user's call — taken
 * once the download is done, not before it starts.
 *
 * Only available inside the Electron shell; in a browser `window.snapdown` is
 * undefined and callers fall back to the GitHub link.
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
        let cancelled = false;

        const offStatus = api.onStatus((s) => setPhase(s.phase as UpdatePhase));
        const offProgress = api.onProgress((p) => setProgress(p));

        /**
         * Pick up whatever the main process is already doing.
         *
         * The download lives there and survives a page reload; only this
         * component's memory of it was lost. Without this, reloading — or
         * anything that caused one, such as clicking the Dock icon — showed
         * "Update available" again as though the download had never started,
         * and starting over was the only option.
         */
        api.state()
            .then((s) => {
                if (cancelled || !s || s.phase === "idle") return;
                setPhase(s.phase as UpdatePhase);
                if (s.received !== undefined && s.total !== undefined) {
                    setProgress({ received: s.received, total: s.total });
                }
            })
            .catch(() => { /* no update in flight */ });

        return () => { cancelled = true; offStatus(); offProgress(); };
    }, []);

    const download = useCallback(async () => {
        const api = window.snapdown?.update;
        if (!api) return;
        setError(null);
        setPhase("locating");
        try {
            await api.download();
        } catch (err) {
            setPhase("error");
            setError(err instanceof Error ? err.message : "The download failed.");
        }
    }, []);

    const restart = useCallback(async () => {
        const api = window.snapdown?.update;
        if (!api) return;
        setPhase("installing");
        try {
            await api.restart();
            // The app quits itself from here — the installer is waiting for
            // this process to exit before it swaps the bundle.
        } catch (err) {
            setPhase("error");
            setError(err instanceof Error ? err.message : "The update couldn't be installed.");
        }
    }, []);

    const percent = progress && progress.total > 0
        ? Math.round((progress.received / progress.total) * 100)
        : null;

    return { available, phase, progress, percent, error, download, restart };
}
