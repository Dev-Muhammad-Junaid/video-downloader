// Next.js's officially-supported "run once when the server process starts"
// hook — fires uniformly under `next dev`, `next start`, and the packaged
// standalone server.js, so this is the one place migrations need to be wired
// regardless of how the app is currently running.
export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { ensureMigrated } = await import("@/lib/migrate");
        ensureMigrated();
    }
}
