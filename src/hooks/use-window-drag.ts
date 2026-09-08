"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * Window-drag regions for the Electron shell.
 *
 * Two things force this to be inline styles rather than CSS classes:
 *
 * 1. Tailwind v4 processes our stylesheet with Lightning CSS, which drops
 *    `-webkit-app-region` as an unknown property. A `.drag-region { … }` rule
 *    simply never reaches the browser — verified by finding zero app-region
 *    declarations in the built CSS. React passes inline styles through
 *    untouched, so they survive.
 *
 * 2. A drag region is handed to the OS as a rectangle, and the OS claims
 *    mouse-down inside it before the page sees the event. A full-screen
 *    overlay painted on top does not reliably reclaim those clicks, so the
 *    region has to be switched off outright while one is open — otherwise the
 *    editor's own header controls sit in a dead strip.
 */

const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [data-slot="dialog-content"]';

/** True while any modal overlay is mounted. */
export function useOverlayOpen(): boolean {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const check = () => setOpen(document.querySelector(OVERLAY_SELECTOR) !== null);
        check();

        // Overlays mount and unmount from many places (the editors, the player,
        // every Dialog), so watching the tree beats threading a callback
        // through each of them.
        const observer = new MutationObserver(check);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    return open;
}

// `-webkit-app-region` isn't in React's CSSProperties (it's an Electron/
// Chromium extension), so the value is built and then widened.
type DragStyle = CSSProperties;

const dragStyle = (value: "drag" | "no-drag"): DragStyle =>
    ({ WebkitAppRegion: value }) as CSSProperties;

/** Style for a strip that should drag the window — unless an overlay is up. */
export function useDragRegion(): DragStyle {
    const overlayOpen = useOverlayOpen();
    return dragStyle(overlayOpen ? "no-drag" : "drag");
}

/** Style for a control living inside a drag region, so it stays clickable. */
export const NO_DRAG: DragStyle = dragStyle("no-drag");
