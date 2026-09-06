"use client";

import * as React from "react";
import {
    Library,
    Settings,
    Cloud,
    Moon,
    Sun,
    History,
} from "lucide-react";
import Image from "next/image";
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
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    const pathname = usePathname();
    const { setOpen, isMobile } = useSidebar();

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
        <Sidebar collapsible="icon">
            <SidebarHeader className="px-3 py-2.5 flex items-center gap-2 flex-row border-b overflow-hidden">
                <Image src="/icon.png" alt="SnapDown" width={26} height={26} className="rounded-md shrink-0" />
                <span className="font-bold text-base leading-none group-data-[collapsible=icon]:hidden">SnapDown</span>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Application</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => {
                                const isActive = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                                return (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton isActive={isActive} render={<Link href={item.url} />}>
                                            <item.icon className="w-4 h-4" />
                                            <span>{item.title}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-2 border-t">
                <UpdateNotifier />
                {mounted && (
                    <Button
                        variant="ghost"
                        title={theme === "dark" ? "Light Mode" : "Dark Mode"}
                        className="w-full justify-start gap-2 h-8 text-sm text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        {theme === "dark" ? (
                            <>
                                <Sun className="w-4 h-4 shrink-0" />
                                <span className="group-data-[collapsible=icon]:hidden">Light Mode</span>
                            </>
                        ) : (
                            <>
                                <Moon className="w-4 h-4 shrink-0" />
                                <span className="group-data-[collapsible=icon]:hidden">Dark Mode</span>
                            </>
                        )}
                    </Button>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
