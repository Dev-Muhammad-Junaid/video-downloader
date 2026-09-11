// Next.js's officially-supported "run once when the server process starts"
// hook — fires uniformly under `next dev`, `next start`, and the packaged
// standalone server.js, so this is the one place migrations need to be wired
// regardless of how the app is currently running.
export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { ensureMigrated } = await import("@/lib/migrate");
        ensureMigrated();

        // Must run after the schema is up to date, and before anything serves
        // the library: media left inside the app bundle by a pre-0.3.4 install
        // is deleted by the next update, so this is the only chance to save it.
        const { rescueBundledMedia } = await import("@/lib/rescue-bundled-media");
        rescueBundledMedia();
    }
}
