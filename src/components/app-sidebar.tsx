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
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

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

export function AppSidebar() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => setMounted(true), []);

    return (
        <Sidebar>
            <SidebarHeader className="p-4 flex items-center gap-2 flex-row border-b">
                <Image src="/logo.png" alt="SnapDown Logo" width={32} height={32} className="rounded-sm" />
                <span className="font-bold text-lg leading-none">SnapDown</span>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Application</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton>
                                        <a href={item.url} className="flex items-center gap-2">
                                            <item.icon className="w-4 h-4" />
                                            <span>{item.title}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-3 border-t">
                {mounted && (
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 h-9 text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        {theme === "dark" ? (
                            <>
                                <Sun className="w-4 h-4" />
                                Light Mode
                            </>
                        ) : (
                            <>
                                <Moon className="w-4 h-4" />
                                Dark Mode
                            </>
                        )}
                    </Button>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
