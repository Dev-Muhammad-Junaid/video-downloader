"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, ExternalLink, SquareArrowOutUpRight } from "lucide-react";
import { useUpdateCheck } from "@/hooks/use-update-check";
import { Markdown } from "@/components/ui/markdown";

/** Sidebar footer entry: shows nothing until an update is actually available,
 *  then a small badged button that opens the changelog + download dialog. Not
 *  auto-update — the user decides if/when to grab the new build themselves. */
export function UpdateNotifier() {
    const info = useUpdateCheck();
    const [open, setOpen] = useState(false);

    if (!info?.updateAvailable) return null;

    return (
        <>
            <Button
                variant="ghost"
                title={`Update available: ${info.latestVersion}`}
                className="relative h-[30px] w-full justify-start gap-2.5 px-2 text-[13px] font-medium text-primary hover:text-primary group-data-[collapsible=icon]:size-[30px]! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>span>svg]:size-[15px]"
                onClick={() => setOpen(true)}
            >
                <span className="relative shrink-0">
                    <Download />
                    <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-sidebar" />
                </span>
                <span className="group-data-[collapsible=icon]:hidden">Update Available</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Download className="size-4 text-primary" />
                            SnapDown {info.latestVersion} is available
                        </DialogTitle>
                    </DialogHeader>

                    <p className="-mt-2 text-[12px] text-muted-foreground">
                        You&rsquo;re on {info.currentVersion}. Downloading and installing is entirely up to you — nothing updates automatically.
                    </p>

                    {info.changelog && (
                        <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/50 p-3">
                            <Markdown content={info.changelog} />
                        </div>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                        <a
                            href={info.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(buttonVariants({ variant: "default" }), "flex-1 gap-1.5")}
                        >
                            <Download className="size-3.5" />
                            Download for macOS
                        </a>
                        <a
                            href={info.releaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
                            title="View full release notes on GitHub"
                        >
                            <ExternalLink className="size-3.5" />
                        </a>
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <SquareArrowOutUpRight className="w-3 h-3" />
                        After downloading, quit SnapDown, drag the new version into Applications, and relaunch.
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
}
