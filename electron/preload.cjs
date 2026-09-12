// Bridge between the renderer and the main process.
//
// Deliberately tiny and fully enumerated: the renderer can ASK for an update
// and listen for progress, but cannot say what to download or where to install
// it. Everything about which release gets fetched is decided in the main
// process against a hardcoded repo, so a compromised page can't turn this into
// an arbitrary code-execution path.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("snapdown", {
    /** Present only in the desktop app — the web build leaves this undefined. */
    isDesktop: true,

    update: {
        /** Download and verify the latest release. Resolves once it's staged —
         *  nothing is installed and the app keeps running. */
        download: () => ipcRenderer.invoke("update:download"),

        /** Install the already-verified update and relaunch. The app quits
         *  immediately after this resolves. */
        restart: () => ipcRenderer.invoke("update:restart"),

        /** Subscribe to progress. Returns an unsubscribe function. */
        onProgress: (callback) => {
            const handler = (_event, payload) => callback(payload);
            ipcRenderer.on("update:progress", handler);
            return () => ipcRenderer.removeListener("update:progress", handler);
        },

        /** Subscribe to phase changes (locating / downloading / verifying /
         *  installing). Returns an unsubscribe function. */
        onStatus: (callback) => {
            const handler = (_event, payload) => callback(payload);
            ipcRenderer.on("update:status", handler);
            return () => ipcRenderer.removeListener("update:status", handler);
        },
    },
});
