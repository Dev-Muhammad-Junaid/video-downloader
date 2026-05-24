"use client";

/**
 * JASSUB-based subtitle renderer.
 *
 * Architecture: two-effect split for instant style updates.
 *
 * Effect 1 (keyed on videoRef): Creates and destroys the JASSUB instance.
 *   JASSUB starts its Worker + WASM once and keeps running. On cleanup it
 *   calls destroy() which removes its self-managed canvas.
 *
 * Effect 2 (keyed on buildAss): Calls renderer.setTrack() on the existing
 *   instance whenever subtitles/config/previewText change. No Worker restart,
 *   no WASM reload — just a fast IPC call (~few ms). Followed by _draw() to
 *   force an immediate repaint even on a paused video.
 *
 * Timeline scrubbing: a 'seeked' listener on the video element calls
 *   renderer._draw(currentTime, true) so the correct subtitle cue is shown
 *   after the user drags the timeline handle.
 *
 * When no `canvas` option is passed to the JASSUB constructor, JASSUB creates
 * a <canvas class="JASSUB"> element, inserts it as the next sibling of the
 * <video>, and styles it `position:absolute` so it overlays the letterbox
 * area exactly. On destroy() it removes that canvas itself.
 */

import { useEffect, useCallback, useRef } from "react";
import { buildAssFile, type SubtitleStyleConfig } from "@/lib/ass-builder";
import { expandForAnimation, subtitlesToSrt } from "./subtitle-types";
import type { Subtitle } from "./subtitle-types";

interface SubtitleRendererProps {
    subtitles: Subtitle[];
    config: SubtitleStyleConfig;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    /** Shown as a static cue when subtitles array is empty (style preview). */
    previewText?: string;
}

function makePreviewSubs(text: string): Subtitle[] {
    return [{
        id: 1,
        start: "00:00:00,000",
        end: "23:59:59,999",
        text,
        confidence: 1.0,
    }];
}

export function SubtitleRenderer({
    subtitles,
    config,
    videoRef,
    previewText,
}: SubtitleRendererProps) {
    /**
     * jassubRef holds the live JASSUB instance across renders.
     * readyRef gates Effect 2 — we don't call setTrack before ready.
     * pendingAssRef holds the latest buildAss() result if Effect 2 fires
     * before JASSUB finishes loading (so Effect 1 can apply it post-ready).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jassubRef    = useRef<any>(null);
    const readyRef     = useRef(false);
    const pendingAssRef = useRef<string | null>(null);

    /**
     * buildAss: memoised ASS file builder. Gets a new reference only when
     * subtitles, config, or previewText change — which is exactly when
     * Effect 2 should fire.
     */
    const buildAss = useCallback((): string => {
        let subs = subtitles;
        if (subs.length === 0 && previewText) {
            subs = makePreviewSubs(previewText);
        }
        // expandForAnimation handles every per-cue mode (karaoke, reveal,
        // spotlight, cascade) and leaves the rest untouched.
        const expanded = expandForAnimation(subs, config.animation);
        return buildAssFile(subtitlesToSrt(expanded), config);
    }, [subtitles, config, previewText]);

    // ─── Effect 1: JASSUB lifecycle (create / destroy) ───────────────────────
    // Re-runs only when the video element itself changes.
    useEffect(() => {
        const video = videoRef.current;
        if (!video || typeof window === "undefined") return;

        let cancelled = false;
        readyRef.current = false;

        (async () => {
            try {
                // Dynamic import keeps the path opaque to Turbopack/webpack.
                // eslint-disable-next-line @typescript-eslint/no-implied-eval
                const dynImport = new Function("url", "return import(url)");
                const JASSUB = (await dynImport("/jassub/jassub.js")).default;
                if (cancelled) return;

                // No `canvas` option → JASSUB creates its own <canvas>,
                // inserts it after <video>, and removes it on destroy().
                //
                // availableFonts maps lowercase ASS font names → public TTF URLs.
                // JASSUB fetches these on demand so each font only loads when used.
                const jassub = new JASSUB({
                    video,
                    subContent: buildAss(),       // initial content
                    workerUrl:    "/jassub/jassub-worker-bundle.js",
                    wasmUrl:      "/jassub/jassub-worker.wasm",
                    modernWasmUrl:"/jassub/jassub-worker-modern.wasm",
                    availableFonts: {
                        "roboto":     "/fonts/Roboto-Regular.ttf",
                        "anton":      "/fonts/Anton-Regular.ttf",
                        "lora":       "/fonts/Lora-Regular.ttf",
                        "oswald":     "/fonts/Oswald-Regular.ttf",
                        "space mono": "/fonts/SpaceMono-Regular.ttf",
                        "nunito":     "/fonts/Nunito-Regular.ttf",
                    },
                });

                await jassub.ready;
                if (cancelled) { jassub.destroy(); return; }

                jassubRef.current = jassub;
                readyRef.current  = true;

                // If Effect 2 fired while we were loading, apply the pending update.
                if (pendingAssRef.current !== null) {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (jassub.renderer as any).setTrack(pendingAssRef.current);
                    } catch { /* ignore */ }
                    pendingAssRef.current = null;
                }

                // Initial render on a paused video.
                await jassub.manualRender({
                    expectedDisplayTime: performance.now(),
                    width:     video.videoWidth  || 1920,
                    height:    video.videoHeight || 1080,
                    mediaTime: video.currentTime,
                });
                if (cancelled) return;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (jassub.renderer as any)._draw(video.currentTime, true);

            } catch (err) {
                if (!cancelled) {
                    console.error("[SubtitleRenderer] init failed:", err);
                }
            }
        })();

        return () => {
            cancelled = true;
            readyRef.current = false;
            if (jassubRef.current) {
                try { jassubRef.current.destroy(); } catch { /* ignore */ }
                jassubRef.current = null;
            }
        };

    // intentionally omitting buildAss — initial content is fine; Effect 2
    // will push updates once the instance is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoRef]);

    // ─── Effect 2: fast content update (no Worker restart) ───────────────────
    // Re-runs whenever buildAss gets a new reference (subtitles/config changed).
    useEffect(() => {
        const assContent = buildAss();
        const video      = videoRef.current;
        if (!video) return;

        if (!readyRef.current || !jassubRef.current) {
            // JASSUB is still loading — stash so Effect 1 applies it post-ready.
            pendingAssRef.current = assContent;
            return;
        }

        // Instance is live — update subtitle content without restarting Worker.
        pendingAssRef.current = null;
        const jassub = jassubRef.current;

        (async () => {
            try {
                // setTrack lives on the renderer proxy (abslink-wrapped ASSRenderer).
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (jassub.renderer as any).setTrack(assContent);
                // Force repaint — wasm.changed may be 0 on a paused video.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (jassub.renderer as any)._draw(video.currentTime, true);
            } catch (err) {
                console.error("[SubtitleRenderer] setTrack failed:", err);
            }
        })();

    }, [buildAss, videoRef]);

    // ─── Effect 3: timeline scrubbing ────────────────────────────────────────
    // Redraws the correct cue after the user seeks on a paused video.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onSeeked = async () => {
            if (!readyRef.current || !jassubRef.current) return;
            const jassub = jassubRef.current;
            try {
                await jassub.manualRender({
                    expectedDisplayTime: performance.now(),
                    width:     video.videoWidth  || 1920,
                    height:    video.videoHeight || 1080,
                    mediaTime: video.currentTime,
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (jassub.renderer as any)._draw(video.currentTime, true);
            } catch { /* ignore */ }
        };

        video.addEventListener("seeked", onSeeked);
        return () => video.removeEventListener("seeked", onSeeked);
    }, [videoRef]);

    // JASSUB manages its own canvas — nothing for React to render.
    return null;
}
