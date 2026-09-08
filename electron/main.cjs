// Electron main process. Plain CommonJS — Electron runs this directly with no
// build/compile step, which keeps the "app shell" independent of the Next.js
// build pipeline it wraps.
const { app, BrowserWindow, shell, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

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

    serverProcess.on("exit", (code) => {
        if (code !== 0 && code !== null) {
            console.error(`[SnapDown] server process exited with code ${code}`);
        }
    });
}

function stopProductionServer() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
        serverProcess = null;
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

    mainWindow.loadURL(APP_URL);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    try {
        if (!isDev) {
            startProductionServer();
        }
        // Dev mode: `npm run electron:dev` already waits for `next dev` to be
        // ready (via wait-on) before launching Electron, so no extra wait here.
        if (!isDev) {
            await waitForServer(APP_URL);
        }
        createWindow();
    } catch (err) {
        console.error("[SnapDown] failed to start:", err);
        app.quit();
    }

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    stopProductionServer();
    if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopProductionServer);
