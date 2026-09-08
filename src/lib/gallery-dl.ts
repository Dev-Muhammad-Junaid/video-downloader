import path from "path";
import os from "os";

/**
 * gallery-dl's install location.
 *
 * Shared so the preflight check and the code that actually runs it can't drift
 * apart — a health check that probes a different path than the downloader uses
 * can report "available" while every download fails.
 */
export const GALLERY_DL_PATH = process.env.APP_GALLERY_DL_PATH?.trim()
    || path.join(os.homedir(), ".local", "bin", "gallery-dl");
