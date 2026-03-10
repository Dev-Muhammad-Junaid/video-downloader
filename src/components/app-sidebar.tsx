"use client";

import * as React from "react";
import {
    Home,
    Download,
    Library,
    Settings,
    Cloud,
} from "lucide-react";
import Image from "next/image";
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
} from "@/components/ui/sidebar";

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
        title: "Settings",
        url: "/settings",
        icon: Settings,
    },
];

export function AppSidebar() {
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
        </Sidebar>
    );
}
