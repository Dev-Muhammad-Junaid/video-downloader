"use client";

import { useEffect } from "react";

/**
 * Marks the document when running inside the Electron shell.
 *
 * The window uses macOS's `hiddenInset` title bar, so the traffic lights are
 * drawn *over* the top-left of our own chrome and the sidebar has to reserve
 * room for them. In a plain browser there are no traffic lights, and that same
 * reserved space would just be a gap — so the offset is gated on this flag
 * rather than applied unconditionally.
 */
export function PlatformClass() {
    useEffect(() => {
        if (navigator.userAgent.includes("Electron")) {
            document.documentElement.dataset.electron = "true";
        }
    }, []);

    return null;
}
