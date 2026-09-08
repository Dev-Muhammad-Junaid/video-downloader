"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import appIcon from "@/assets/app-icon.png";
import { usePathname } from "next/navigation";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
    "/": "Library",
    "/sync": "Cloud Sync",
    "/history": "History",
    "/settings": "Settings",
};

const TOOLBAR_SLOT_ID = "toolbar-actions-slot";

/**
 * macOS unified toolbar: the title bar and the app's toolbar are one surface.
 * It's translucent over the scrolling content, separated only by a hairline,
 * and the whole strip is a window drag region — the three things that make a
 * window read as native rather than as a web page in a frame.
 *
 * Under Electron's `hiddenInset` title bar the traffic lights are painted over
 * the top-left of the window, so *something* has to keep that strip clear. Which
 * surface that is depends on the sidebar: when it's expanded the lights sit over
 * the sidebar header, which reserves the space itself; when it's collapsed to an
 * icon rail (or hidden entirely on mobile) the lights spill into the toolbar, so
 * the toolbar has to reserve what the rail doesn't cover.
 */
export function AppToolbar() {
    const pathname = usePathname();
    const { state, isMobile } = useSidebar();

    const title =
        TITLES[pathname] ??
        Object.entries(TITLES).find(([path]) => path !== "/" && pathname.startsWith(path))?.[1] ??
        "SnapDown";

    // Width the traffic lights need, minus whatever the collapsed rail already
    // covers. Only ever applied inside Electron (see PlatformClass).
    const trafficLightPad = isMobile
        ? "in-data-[electron=true]:pl-[82px]"
        : state === "collapsed"
            ? "in-data-[electron=true]:pl-[38px]"
            : "";

    return (
        <header
            className={cn(
                "drag-region hairline-b sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-2.5 bg-[var(--toolbar)] px-3 backdrop-blur-xl backdrop-saturate-150",
                trafficLightPad
            )}
        >
            <SidebarTrigger className="no-drag" />
            <h1 className="truncate text-[13px] font-medium tracking-[-0.01em] text-muted-foreground select-none">
                {title}
            </h1>

            {/*
             * App identity, centred on the toolbar. Absolutely positioned so it
             * stays centred no matter how wide the leading title or the trailing
             * actions grow, and pointer-events-none so it never swallows a window
             * drag. Hidden on narrow windows, where the leading and trailing
             * content would otherwise run into it.
             */}
            <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 select-none items-center gap-1.5 md:flex">
                <Image
                    src={appIcon}
                    alt=""
                    width={17}
                    height={17}
                    draggable={false}
                    className="rounded-[4px]"
                />
                <span className="text-[13px] font-semibold tracking-[-0.01em]">SnapDown</span>
            </div>

            <div id={TOOLBAR_SLOT_ID} className="no-drag ml-auto flex items-center gap-1.5" />
        </header>
    );
}

/**
 * Lets a page hoist its own controls into the toolbar — the AppKit pattern
 * where a window's toolbar carries the current view's actions — without the
 * toolbar needing to know about any particular page.
 */
export function ToolbarActions({ children }: { children: React.ReactNode }) {
    const [slot, setSlot] = React.useState<HTMLElement | null>(null);

    React.useEffect(() => {
        setSlot(document.getElementById(TOOLBAR_SLOT_ID));
    }, []);

    return slot ? createPortal(children, slot) : null;
}
