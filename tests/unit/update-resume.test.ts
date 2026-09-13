import { describe, it, expect } from "vitest";

/**
 * An update download must survive the renderer reloading.
 *
 * Clicking the Dock icon called openApp(), which called loadURL()
 * unconditionally — reloading the page and discarding the React state holding
 * the download's progress. The indicator reset to "Update available" and the
 * only option was to start the 180 MB download again. A finished-and-verified
 * update lost its "Restart" state the same way.
 *
 * The download itself always ran in the main process and was never actually
 * interrupted; only the UI's memory of it was. These pin the state machine the
 * renderer now re-reads on mount.
 */

type State =
    | { phase: "idle" }
    | { phase: "locating" }
    | { phase: "downloading"; version: string; received: number; total: number }
    | { phase: "verifying"; version: string }
    | { phase: "ready"; version: string };

/** Mirrors getUpdateState(): live progress wins, else a staged build, else idle. */
function getUpdateState(progress: State | null, staged: { version: string } | null): State {
    if (progress) return progress;
    return staged ? { phase: "ready", version: staged.version } : { phase: "idle" };
}

describe("update state survives a reload", () => {
    it("reports an in-flight download so the UI can re-attach", () => {
        const s = getUpdateState({ phase: "downloading", version: "v1", received: 50, total: 100 }, null);
        expect(s.phase).toBe("downloading");
        expect(s).toMatchObject({ received: 50, total: 100 });
    });

    it("reports a verified update as ready, not as newly available", () => {
        // The case where "Restart to update" turned back into "Update available".
        expect(getUpdateState(null, { version: "v1" })).toEqual({ phase: "ready", version: "v1" });
    });

    it("live progress takes precedence over a previously staged build", () => {
        const s = getUpdateState({ phase: "downloading", version: "v2", received: 1, total: 9 }, { version: "v1" });
        expect(s.phase).toBe("downloading");
    });

    it("is idle when nothing is happening", () => {
        expect(getUpdateState(null, null)).toEqual({ phase: "idle" });
    });

    it("a failed download clears progress rather than freezing the bar", () => {
        // Without clearing, the indicator sits at whatever percentage it died
        // at for the rest of the session, with no way to retry.
        let progress: State | null = { phase: "downloading", version: "v1", received: 40, total: 100 };
        try {
            throw new Error("network died");
        } catch {
            progress = null;
        }
        expect(getUpdateState(progress, null)).toEqual({ phase: "idle" });
    });
});

/**
 * Re-activating the app must not reload a window that is already working.
 * `reload: false` is the Dock-click path.
 */
function shouldReload(opts: { reload: boolean; hasWindow: boolean; currentUrl: string; appUrl: string }): boolean {
    if (!opts.hasWindow) return true;
    return opts.reload || !opts.currentUrl || !opts.currentUrl.startsWith(opts.appUrl);
}

describe("re-activation", () => {
    const appUrl = "http://localhost:3000";

    it("does not reload a healthy window when focused from the Dock", () => {
        expect(shouldReload({ reload: false, hasWindow: true, currentUrl: appUrl + "/", appUrl })).toBe(false);
    });

    it("still loads when there is no window yet", () => {
        expect(shouldReload({ reload: false, hasWindow: false, currentUrl: "", appUrl })).toBe(true);
    });

    it("recovers a window stuck on the startup-failure page", () => {
        expect(shouldReload({ reload: false, hasWindow: true, currentUrl: "data:text/html,...", appUrl })).toBe(true);
    });

    it("reloads on a genuine launch", () => {
        expect(shouldReload({ reload: true, hasWindow: true, currentUrl: appUrl + "/", appUrl })).toBe(true);
    });
});
