// Electron main process. Plain CommonJS — Electron runs this directly with no
// build/compile step, which keeps the "app shell" independent of the Next.js
// build pipeline it wraps.
const { app, BrowserWindow, shell, nativeTheme, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");
const { downloadUpdate, installStagedUpdate, resolveAppBundlePath } = require("./updater.cjs");

const isDev = !app.isPackaged;
const PORT = process.env.SNAPDOWN_PORT || 3000;
const APP_URL = `http://localhost:${PORT}`;

// Per-user writable app-data dir (~/Library/Application Support/SnapDown).
// Read by src/lib/app-paths.ts inside the Next.js server for the settings
// file and SQLite DB — there is no writable project directory once packaged.
const userDataDir = app.getPath("userData");
fs.mkdirSync(userDataDir, { recursive: true });

let mainWindow = null;
let serverProcess = null;
// Distinguishes a server exit we asked for (quitting) from one we didn't
// (a crash), so only the latter triggers a restart.
let stoppingDeliberately = false;
let isQuitting = false;

function waitForServer(url, { timeoutMs = 30000, intervalMs = 300 } = {}) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const tryOnce = () => {
            const req = http.get(url, (res) => {
                res.resume();
                resolve();
            });
            req.on("error", () => {
                if (Date.now() > deadline) {
                    reject(new Error(`Server didn't respond at ${url} within ${timeoutMs}ms`));
                } else {
                    setTimeout(tryOnce, intervalMs);
                }
            });
        };
        tryOnce();
    });
}

/**
 * Is something already serving *our* app on the port?
 *
 * Checked rather than assumed, because a bare "does the port answer" probe
 * happily succeeds against an unrelated dev server — and on a developer's
 * machine port 3000 is the most contended port there is. Loading that would
 * show someone else's site inside SnapDown.
 */
function probeOurServer(url, { timeoutMs = 2000 } = {}) {
    return new Promise((resolve) => {
        const req = http.get(`${url}/api/check-update`, { timeout: timeoutMs }, (res) => {
            let body = "";
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => {
                try {
                    resolve(Boolean(JSON.parse(body).currentVersion));
                } catch {
                    resolve(false);
                }
            });
        });
        req.on("error", () => resolve(false));
        req.on("timeout", () => { req.destroy(); resolve(false); });
    });
}

/** In production, spawn the Next.js standalone server as a child process. */
function startProductionServer() {
    // next.config.ts has output:"standalone" — the standalone bundle is copied
    // in via extraResources as "standalone" (deliberately NOT "app", which is
    // electron-builder's own reserved destination name for its `files`-selected
    // content — reusing it caused the two copies to collide/clobber).
    const serverPath = path.join(process.resourcesPath, "standalone", "server.js");

    serverProcess = spawn(process.execPath, [serverPath], {
        env: {
            ...process.env,
            PORT: String(PORT),
            HOSTNAME: "localhost",
            NODE_ENV: "production",
            SNAPDOWN_USER_DATA_DIR: userDataDir,
            ELECTRON_RUN_AS_NODE: "1",
        },
        stdio: "inherit",
    });

    // The window is useless without the server behind it, and the failure is
    // invisible — the page simply never loads and you get an empty window in
    // the background colour. So an unexpected exit gets restarted rather than
    // just logged.
    serverProcess.on("exit", (code) => {
        serverProcess = null;
        if (isQuitting || stoppingDeliberately) return;

        console.error(`[SnapDown] server exited unexpectedly (code ${code}) — restarting`);
        void reviveServer();
    });
}

function stopProductionServer() {
    stoppingDeliberately = true;
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
    }
    serverProcess = null;
}

/**
 * Makes sure the app has a working server behind it, starting one if needed.
 * Safe to call repeatedly — reused on launch, on re-activation from the Dock,
 * and after a crash.
 */
async function ensureServerRunning() {
    if (isDev) return;
    stoppingDeliberately = false;

    if (await probeOurServer(APP_URL)) return;

    if (!serverProcess) startProductionServer();
    await waitForServer(APP_URL);
}

/** Restart after an unexpected exit, backing off, then give up gracefully. */
async function reviveServer(attempt = 1) {
    const MAX_ATTEMPTS = 5;
    if (isQuitting) return;

    try {
        await new Promise((r) => setTimeout(r, Math.min(attempt * 500, 3000)));
        if (isQuitting) return;
        await ensureServerRunning();
        // Whatever the window was showing is stale now — reload it into the
        // freshly started server.
        mainWindow?.loadURL(APP_URL);
    } catch (err) {
        if (attempt >= MAX_ATTEMPTS) {
            console.error("[SnapDown] server could not be restarted:", err);
            showStartupFailure(err);
            return;
        }
        void reviveServer(attempt + 1);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        // Opens at roughly tablet size rather than filling a desktop display.
        // Deliberately kept above the sidebar's 1100px auto-collapse threshold
        // (AUTO_COLLAPSE_WIDTH in app-sidebar.tsx) so the app doesn't launch
        // with its own navigation already collapsed to an icon rail.
        width: 1180,
        height: 820,
        center: true,
        // Low enough to reach true mobile widths — the app's own responsive
        // breakpoints (sidebar icon-collapse, mobile drawer) handle anything
        // smaller than a "desktop" width, so the window itself shouldn't be
        // the thing stopping that from being testable.
        minWidth: 360,
        minHeight: 500,
        title: "SnapDown",
        // The defining chrome of a native Mac app: no separate OS title bar,
        // with the traffic lights floating over the app's own toolbar. The
        // renderer reserves space for them (see AppToolbar / AppSidebar), and
        // the y offset centres them in that 52px toolbar.
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 19, y: 18 },
        // Matches the light/dark window background so the first paint doesn't
        // flash white before the renderer's theme applies.
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c1c1e" : "#ffffff",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, "preload.cjs"),
        },
        show: false,
    });

    mainWindow.once("ready-to-show", () => mainWindow.show());

    // Open external links (e.g. "Open source URL" in History) in the
    // system browser instead of navigating the app window to them.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    // Tell the renderer it's running in the desktop shell, so it can reserve
    // room for the traffic lights. Set from here rather than by sniffing
    // navigator.userAgent in the page: the UA string is not guaranteed to
    // contain "Electron" (apps and Electron versions change it), and a silent
    // false there just means the window controls quietly overlap the UI.
    const markAsDesktop = () => {
        mainWindow?.webContents
            .executeJavaScript('document.documentElement.dataset.electron = "true";')
            .catch(() => {});
    };
    mainWindow.webContents.on("did-finish-load", markAsDesktop);
    // Client-side navigations keep the same document, but a reload doesn't.
    mainWindow.webContents.on("did-navigate-in-page", markAsDesktop);

    // A renderer crash leaves the window blank with no indication why, so
    // bring it back rather than leaving a dead frame on screen.
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        console.error(`[SnapDown] renderer gone: ${details.reason}`);
        if (!isQuitting) void openApp();
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

/**
 * Replaces a blank window with something that says what went wrong.
 *
 * Without this a server that won't start leaves an empty window painted in the
 * background colour and nothing else — no text, no error, no hint that a
 * child process is missing. It keeps retrying in the background and swaps
 * itself out for the app the moment the server answers.
 */
function showStartupFailure(err) {
    if (!mainWindow) return;

    const detail = String(err?.message || err || "Unknown error")
        .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const dark = nativeTheme.shouldUseDarkColors;

    const page = `
        <meta charset="utf-8">
        <style>
          :root { color-scheme: ${dark ? "dark" : "light"}; }
          body {
            margin: 0; height: 100vh; display: flex; align-items: center;
            justify-content: center; text-align: center; -webkit-app-region: drag;
            font: 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            background: ${dark ? "#1c1c1e" : "#f6f6f8"};
            color: ${dark ? "#f5f5f7" : "#1d1d1f"};
          }
          .box { max-width: 420px; padding: 0 32px; }
          h1 { font-size: 15px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.01em; }
          p { margin: 0 0 6px; color: ${dark ? "#98989d" : "#6e6e73"}; line-height: 1.5; }
          code {
            font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
            background: ${dark ? "#2c2c2e" : "#ececef"};
            padding: 2px 5px; border-radius: 4px;
          }
        </style>
        <div class="box">
          <h1>SnapDown couldn't start its background service</h1>
          <p>It will keep trying. If this persists, another program may be using
             port ${PORT} &mdash; quit it, or set <code>SNAPDOWN_PORT</code> to a free port.</p>
          <p><code>${detail}</code></p>
        </div>`;

    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);

    // Keep trying, and take the window back to the app once it's healthy.
    const retry = setInterval(async () => {
        if (isQuitting || !mainWindow) return clearInterval(retry);
        if (await probeOurServer(APP_URL)) {
            clearInterval(retry);
            mainWindow.loadURL(APP_URL);
        }
    }, 3000);
}

/** Bring the app back up, whether from launch or from the Dock. */
async function openApp() {
    try {
        await ensureServerRunning();
        if (!mainWindow) createWindow();
        mainWindow.loadURL(APP_URL);
    } catch (err) {
        console.error("[SnapDown] failed to start:", err);
        // A failure here used to quit the app outright on launch, and produce a
        // permanently blank window on re-activation. Neither told the user
        // anything, so show the reason and keep retrying instead.
        if (!mainWindow) createWindow();
        showStartupFailure(err);
    }
}

// A second launch must not spawn a rival instance: it would fail to bind the
// port, and worse, whichever instance quits first takes the shared server down
// with it and leaves the other showing an empty window.
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        } else {
            void openApp();
        }
    });

    app.whenReady().then(() => {
        void openApp();

        // In-app update. The renderer can request one but has no say in what
        // gets downloaded or where it's installed — see electron/updater.cjs.
        ipcMain.handle("update:download", async (event) => downloadUpdate(event.sender));

        ipcMain.handle("update:restart", async () => {
            const result = installStagedUpdate(resolveAppBundlePath());
            // The installer waits for this process to exit before swapping the
            // bundle, so quitting is the last step, not a suggestion to the user.
            setTimeout(() => {
                isQuitting = true;
                stopProductionServer();
                app.quit();
            }, 400);
            return result;
        });

        app.on("activate", () => {
            // Re-opening from the Dock has to re-check the server, not just the
            // window — the two can outlive each other.
            void openApp();
        });
    });
}

app.on("window-all-closed", () => {
    // Deliberately does NOT stop the server on macOS. The app stays resident
    // when its window closes (standard macOS behaviour), so killing the server
    // here left the process alive with nothing behind it — reopening from the
    // Dock then loaded a dead URL and showed an empty window. The server is
    // shut down on quit instead.
    if (process.platform !== "darwin") {
        stopProductionServer();
        app.quit();
    }
});

app.on("before-quit", () => {
    isQuitting = true;
    stopProductionServer();
});
