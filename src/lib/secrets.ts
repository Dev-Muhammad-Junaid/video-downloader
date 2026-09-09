import { execFileSync } from "child_process";

/**
 * Keychain-backed storage for API keys and cloud credentials.
 *
 * Secrets used to sit in plaintext inside `.server_settings.json`, world
 * readable at 0644. Anything that could read your home directory — a backup, a
 * synced folder, Time Machine, a stray `cat` — got your Groq key and your R2
 * secret access key along with it.
 *
 * This stores them in the login Keychain instead, through `/usr/bin/security`.
 *
 * WHY THE CLI RATHER THAN ELECTRON'S safeStorage:
 *
 * Two reasons. The Next.js server runs as a child process of Electron, and
 * `safeStorage` is a main-process API — using it would mean building an IPC
 * bridge just to read a key. More importantly, Keychain ACLs bind to a code
 * signature, and this app is currently ad-hoc signed with no team identity
 * (`codesign -dv` reports `Signature=adhoc`), so macOS cannot recognise it
 * across rebuilds and would re-prompt or lose access every time a new build
 * ships.
 *
 * Going through `/usr/bin/security` sidesteps that: the application on the
 * item's ACL is `security` itself — Apple-signed and stable — so reads succeed
 * without a prompt no matter how this app is signed. Verified end to end,
 * including a read from a plain node child process exactly like the server.
 *
 * WHAT THIS DOES AND DOESN'T PROTECT:
 *
 * It protects the secret AT REST. The settings file no longer contains it, so
 * backups, synced folders and casual file reads come up empty.
 *
 * It does NOT protect against a process already running as you — that process
 * can shell out to `security` the same way this does. No local-app design can
 * fix that while the app still needs to use the key. Encryption at rest is the
 * bounded, real win here.
 */

const SERVICE = "SnapDown";

/** macOS only. Everything else keeps using the settings file. */
export function isKeychainAvailable(): boolean {
    return process.platform === "darwin";
}

/**
 * Read one secret. Returns undefined when absent — which is the normal case
 * for a fresh install, not an error worth logging.
 */
export function readSecret(account: string): string | undefined {
    if (!isKeychainAvailable()) return undefined;
    try {
        const value = execFileSync(
            "/usr/bin/security",
            ["find-generic-password", "-s", SERVICE, "-a", account, "-w"],
            { encoding: "utf-8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] },
        ).replace(/\n$/, "");
        return value.length > 0 ? value : undefined;
    } catch {
        // Exit code 44 = item not found, which is expected. Anything else
        // (locked keychain, missing binary) also lands here and is handled the
        // same way: fall back to whatever the caller has.
        return undefined;
    }
}

/**
 * Write one secret, replacing any existing value. Returns false if the
 * Keychain refused, so the caller can decide whether to fall back.
 *
 * `-U` updates in place rather than creating a duplicate entry. The value goes
 * via `-w` as an argument, which is visible in `ps` for the moment the process
 * runs; passing it on stdin is not supported by `security`, and the exposure
 * window is a few milliseconds on a single-user machine.
 */
export function writeSecret(account: string, value: string): boolean {
    if (!isKeychainAvailable()) return false;
    try {
        execFileSync(
            "/usr/bin/security",
            [
                "add-generic-password",
                "-U",
                "-s", SERVICE,
                "-a", account,
                "-w", value,
                "-D", "application password",
                "-j", "Stored by SnapDown so it never has to sit in a plaintext settings file.",
            ],
            { timeout: 5_000, stdio: ["ignore", "ignore", "pipe"] },
        );
        return true;
    } catch (err) {
        console.error(`[Secrets] Could not write "${account}" to the Keychain:`, err instanceof Error ? err.message : err);
        return false;
    }
}

/** Remove a secret. Missing items are not an error. */
export function deleteSecret(account: string): void {
    if (!isKeychainAvailable()) return;
    try {
        execFileSync(
            "/usr/bin/security",
            ["delete-generic-password", "-s", SERVICE, "-a", account],
            { timeout: 5_000, stdio: "ignore" },
        );
    } catch {
        // Already absent.
    }
}
