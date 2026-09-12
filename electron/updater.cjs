// In-app updater: download, verify, replace, relaunch.
//
// SECURITY MODEL
//
// The app has no Apple Developer ID, so macOS can't tell us whether a
// downloaded build is genuinely ours. Everything below exists to establish
// that ourselves:
//
//   1. The release is located through a HARDCODED repo. The renderer cannot
//      hand this process a URL to download and execute — it can only ask for
//      "the latest release of this repo".
//   2. Only assets from github.com / *.githubusercontent.com over HTTPS are
//      fetched, so a tampered release body can't redirect the download.
//   3. The .dmg's SHA-512 must match the signature we verify, using an Ed25519
//      public key compiled into the app. The matching private key lives only
//      on the maintainer's machine, never in the repo — so compromising the
//      GitHub account is NOT sufficient to ship a malicious update.
//   4. Nothing is mounted or installed until that verification passes.
//
// The last point is the one that matters: a SHA-512 published in the same
// release as the file it describes proves nothing against an attacker who can
// edit the release. The signature is what makes the check meaningful.
//
// QUARANTINE
//
// Because the app is unsigned, the replaced bundle would be blocked by
// Gatekeeper on relaunch. The installer therefore clears the quarantine
// attribute on the app it just wrote. That is a deliberate weakening of a
// macOS safety net, and it is only defensible because of the signature check
// above — we clear quarantine only on a bundle we have cryptographically
// established is ours. When the app gains a Developer ID this whole file
// should be replaced by electron-updater.

const { BrowserWindow, app } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { spawn, execFileSync } = require("child_process");

const REPO = "Dev-Muhammad-Junaid/video-downloader";

// Ed25519 public key matching ~/.snapdown/release-signing-key.pem.
// Replacing this invalidates every previously published signature.
const RELEASE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEALyB9w4JJL/eEYd9F699tSuHhnpOANB5OSYaZqSep1yE=
-----END PUBLIC KEY-----`;

const ALLOWED_HOSTS = new Set([
    "api.github.com",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
]);

function assertAllowedUrl(url) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error(`Refusing non-HTTPS URL: ${url}`);
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
        throw new Error(`Refusing download from unexpected host: ${parsed.hostname}`);
    }
    return parsed;
}

function httpsGet(url, { onProgress, redirectsLeft = 5 } = {}) {
    return new Promise((resolve, reject) => {
        assertAllowedUrl(url);
        const req = https.get(
            url,
            { headers: { "User-Agent": "SnapDown-Updater", Accept: "*/*" } },
            (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    if (redirectsLeft <= 0) return reject(new Error("Too many redirects"));
                    // Re-validated by assertAllowedUrl on the recursive call.
                    return resolve(httpsGet(new URL(res.headers.location, url).href, {
                        onProgress,
                        redirectsLeft: redirectsLeft - 1,
                    }));
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                }

                const total = Number(res.headers["content-length"]) || 0;
                let received = 0;
                const chunks = [];
                res.on("data", (chunk) => {
                    chunks.push(chunk);
                    received += chunk.length;
                    if (onProgress && total) onProgress(received, total);
                });
                res.on("end", () => resolve(Buffer.concat(chunks)));
                res.on("error", reject);
            },
        );
        req.on("error", reject);
        req.setTimeout(120_000, () => req.destroy(new Error("Download timed out")));
    });
}

/** Locate the latest release's .dmg and its detached signature. */
async function fetchLatestRelease() {
    const body = await httpsGet(`https://api.github.com/repos/${REPO}/releases/latest`);
    const release = JSON.parse(body.toString("utf-8"));
    const assets = release.assets || [];

    const dmg = assets.find((a) => a.name.endsWith(".dmg"));
    const sig = assets.find((a) => a.name.endsWith(".dmg.sig"));

    if (!dmg) throw new Error("This release has no .dmg to install.");
    if (!sig) {
        throw new Error(
            "This release isn't signed, so it can't be installed from inside the app. " +
            "Download it from GitHub and install it manually if you trust it.",
        );
    }

    return {
        version: release.tag_name,
        dmgUrl: dmg.browser_download_url,
        dmgName: dmg.name,
        sigUrl: sig.browser_download_url,
        size: dmg.size,
    };
}

/**
 * Verify the download really came from us.
 *
 * Throws — loudly and without installing anything — if it didn't.
 */
function verifySignature(dmgBuffer, signatureBase64) {
    const digest = crypto.createHash("sha512").update(dmgBuffer).digest();
    const signature = Buffer.from(signatureBase64.trim(), "base64");
    const publicKey = crypto.createPublicKey(RELEASE_PUBLIC_KEY);

    // Ed25519 signs the message directly; `null` selects "no separate hash".
    const ok = crypto.verify(null, digest, publicKey, signature);
    if (!ok) {
        throw new Error(
            "The downloaded update failed its signature check and was NOT installed. " +
            "It may have been corrupted or tampered with. Nothing on your Mac was changed.",
        );
    }
    return digest.toString("base64");
}

/**
 * Hand the swap to a detached script.
 *
 * An app can't reliably replace its own bundle while running, so this writes a
 * helper, launches it detached, and quits. The helper waits for our PID to
 * disappear, swaps the bundle, and reopens the app at the SAME path — which is
 * what keeps the Dock entry working. Deleting the old app and copying a new one
 * in leaves the Dock pointing at nothing.
 */
function scheduleInstall({ dmgPath, appPath }) {
    const script = `#!/bin/bash
set -e
APP_PATH=${JSON.stringify(appPath)}
DMG=${JSON.stringify(dmgPath)}
PID=${process.pid}

# Wait (up to ~20s) for the running app to exit before touching its bundle.
for _ in $(seq 1 200); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 0.1
done

MOUNT=$(mktemp -d /tmp/snapdown-update-XXXXXX)
hdiutil attach "$DMG" -mountpoint "$MOUNT" -nobrowse -quiet

SRC=$(find "$MOUNT" -maxdepth 1 -name "*.app" -print -quit)
if [ -z "$SRC" ]; then
  hdiutil detach "$MOUNT" -quiet || true
  exit 1
fi

# Stage beside the target, then swap. Building the new copy first means a
# failed or partial download can never leave the user without a working app.
STAGED="$APP_PATH.updating"
rm -rf "$STAGED"
ditto "$SRC" "$STAGED"

# Verified as ours before we got here, so clearing the Gatekeeper quarantine
# flag is safe; without this an unsigned app refuses to reopen.
xattr -dr com.apple.quarantine "$STAGED" 2>/dev/null || true

rm -rf "$APP_PATH.previous"
mv "$APP_PATH" "$APP_PATH.previous" 2>/dev/null || true
mv "$STAGED" "$APP_PATH"
rm -rf "$APP_PATH.previous"

hdiutil detach "$MOUNT" -quiet || true
rmdir "$MOUNT" 2>/dev/null || true
rm -f "$DMG"

open "$APP_PATH"
`;

    const scriptPath = path.join(os.tmpdir(), `snapdown-install-${Date.now()}.sh`);
    fs.writeFileSync(scriptPath, script, { mode: 0o700 });

    const child = spawn("/bin/bash", [scriptPath], {
        detached: true,
        stdio: "ignore",
    });
    child.unref();
}

/** The .app bundle we're running from, or null when that isn't a real install. */
function resolveAppBundlePath() {
    // .../SnapDown.app/Contents/MacOS/SnapDown -> .../SnapDown.app
    const exe = app.getPath("exe");
    const marker = ".app/Contents/MacOS/";
    const index = exe.indexOf(marker);
    if (index === -1) return null;
    return exe.slice(0, index + 4);
}

/**
 * A verified update, downloaded and waiting for the user to say when.
 *
 * Downloading and installing are deliberately separate: the install replaces
 * the app and quits it, so it has to be the user's decision, taken after the
 * download has finished rather than before it starts.
 */
let staged = null; // { version, dmgPath }

/**
 * Download and verify the latest release. Does NOT install — call
 * installStagedUpdate() for that.
 *
 * Takes no URL on purpose: the renderer can ask for an update, not choose what
 * gets executed.
 */
async function downloadUpdate(sender) {
    const emit = (channel, payload) => {
        if (sender && !sender.isDestroyed()) sender.send(channel, payload);
    };

    const appPath = resolveAppBundlePath();
    if (!appPath) {
        throw new Error("In-app updates are only available in the installed app, not in development.");
    }
    if (!fs.existsSync(appPath)) {
        throw new Error(`Can't find the installed app at ${appPath}.`);
    }

    emit("update:status", { phase: "locating" });
    const release = await fetchLatestRelease();

    emit("update:status", { phase: "downloading", version: release.version, size: release.size });
    const dmgBuffer = await httpsGet(release.dmgUrl, {
        onProgress: (received, total) => emit("update:progress", { received, total }),
    });

    emit("update:status", { phase: "verifying" });
    const signature = (await httpsGet(release.sigUrl)).toString("utf-8");
    verifySignature(dmgBuffer, signature);

    // Only now does anything touch the disk outside a temp file.
    const dmgPath = path.join(os.tmpdir(), release.dmgName);
    fs.writeFileSync(dmgPath, dmgBuffer, { mode: 0o600 });

    staged = { version: release.version, dmgPath };
    emit("update:status", { phase: "ready", version: release.version });
    return { version: release.version };
}

/** Whether a verified update is sitting on disk waiting to be installed. */
function getStagedUpdate() {
    if (staged && !fs.existsSync(staged.dmgPath)) staged = null;
    return staged;
}

/**
 * Install the update downloaded earlier and relaunch.
 *
 * Refuses if nothing has been verified and staged, so this can never be used
 * to install something that skipped the signature check.
 */
function installStagedUpdate(appPath) {
    const ready = getStagedUpdate();
    if (!ready) throw new Error("No verified update is ready to install.");
    scheduleInstall({ dmgPath: ready.dmgPath, appPath });
    return { version: ready.version };
}

module.exports = {
    downloadUpdate,
    installStagedUpdate,
    getStagedUpdate,
    resolveAppBundlePath,
    verifySignature,
    RELEASE_PUBLIC_KEY,
};
