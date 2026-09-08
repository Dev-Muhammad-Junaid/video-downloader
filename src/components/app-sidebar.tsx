"use client";

import * as React from "react";
import {
    PanelLeftClose,
    PanelLeftOpen,
    Library,
    Settings,
    Cloud,
    Moon,
    Sun,
    History,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarFooter,
    useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { UpdateNotifier } from "@/components/update-notifier";
import { useDragRegion } from "@/hooks/use-window-drag";

const items = [
    {
        title: "Library",
        url: "/",
        icon: Library,
    },
    {
        title: "Cloud Sync",
        url: "/sync",
        icon: Cloud,
    },
    {
        title: "History",
        url: "/history",
        icon: History,
    },
    {
        title: "Settings",
        url: "/settings",
        icon: Settings,
    },
];

// Below this window width the sidebar auto-collapses to an icon-only rail so
// the main content (queue + library grid) keeps enough room on a narrowed
// desktop window; above it, it auto-expands back. Purely reactive to window
// size — doesn't fight a manual toggle since there's nothing to remember
// across a resize.
const AUTO_COLLAPSE_WIDTH = 1100;

export function AppSidebar() {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const [mounted, setMounted] = React.useState(false);
    const pathname = usePathname();
    const { setOpen, isMobile, state, toggleSidebar } = useSidebar();
    const dragRegion = useDragRegion();

    React.useEffect(() => setMounted(true), []);

    // setOpen's identity changes every time `open` does (it closes over `open`
    // in its own useCallback deps) — depending on it directly here made this
    // effect re-run, and therefore synchronously re-evaluate and override the
    // sidebar state, on every single open/close, including a manual toggle
    // click. That's what made the toggle button appear to do nothing at a
    // narrow width: it flipped open, which changed setOpen's identity, which
    // re-ran this effect, which immediately saw the (unchanged) narrow width
    // and flipped it straight back. A ref sidesteps that: the effect only
    // re-subscribes when isMobile changes (entering/leaving mobile mode), but
    // still always calls the latest setOpen.
    const setOpenRef = React.useRef(setOpen);
    React.useEffect(() => {
        setOpenRef.current = setOpen;
    });

    React.useEffect(() => {
        if (isMobile) return;
        const handleResize = () => setOpenRef.current(window.innerWidth >= AUTO_COLLAPSE_WIDTH);
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isMobile]);

    return (
        <Sidebar collapsible="icon" className="hairline-r border-r-0">
            {/*
             * Empty by design: this is the strip Electron draws the traffic
             * lights into, and it keeps the source list aligned with the top of
             * the content area. Its height matches AppToolbar's.
             */}
            <SidebarHeader style={dragRegion} className="h-[52px] shrink-0" />

            <SidebarContent className="px-2">
                <SidebarGroup className="p-0">
                    {/* Source-list section headers in macOS are small, uppercase and
                        low-contrast — a label for the group, not a heading. */}
                    <SidebarGroupLabel className="mb-0.5 h-6 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70 select-none">
                        Application
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu className="gap-0.5">
                            {items.map((item) => {
                                const isActive = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                                return (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            isActive={isActive}
                                            tooltip={item.title}
                                            className="h-[30px] gap-2.5 rounded-md px-2 text-[13px] font-medium data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-[0_1px_2px_rgb(0_0_0/0.14)] [&>svg]:size-[15px] [&>svg]:opacity-65 data-active:[&>svg]:opacity-100"
                                            render={<Link href={item.url} />}
                                        >
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="gap-0.5 p-2 hairline-t">
                <UpdateNotifier />
                {/* Collapse control sits with the other persistent sidebar
                    controls rather than in the toolbar, where it read as
                    pointing away from the thing it acts on. Hidden on mobile,
                    where the sidebar is an overlay and the toolbar carries the
                    trigger instead. */}
                {!isMobile && (
                    <Button
                        variant="ghost"
                        title={state === "collapsed" ? "Expand Sidebar" : "Collapse Sidebar"}
                        className="h-[30px] w-full justify-start gap-2.5 px-2 text-[13px] font-medium text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:size-[30px]! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>svg]:size-[15px]"
                        onClick={toggleSidebar}
                    >
                        {state === "collapsed"
                            ? <PanelLeftOpen className="shrink-0" />
                            : <PanelLeftClose className="shrink-0" />}
                        <span className="group-data-[collapsible=icon]:hidden">Collapse</span>
                    </Button>
                )}
                {mounted && (
                    <Button
                        variant="ghost"
                        title={isDark ? "Switch to Light Appearance" : "Switch to Dark Appearance"}
                        className="h-[30px] w-full justify-start gap-2.5 px-2 text-[13px] font-medium text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:size-[30px]! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>svg]:size-[15px]"
                        onClick={() => setTheme(isDark ? "light" : "dark")}
                    >
                        {isDark ? <Sun className="shrink-0" /> : <Moon className="shrink-0" />}
                        <span className="group-data-[collapsible=icon]:hidden">
                            {isDark ? "Light" : "Dark"} Appearance
                        </span>
                    </Button>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
