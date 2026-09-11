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
                    {/* Spelled out because the obvious approach — drag the old
                        app to the Trash, then copy the new one in — gives the
                        bundle a new identity at that path, which leaves the Dock
                        icon pointing at nothing ("the application can't be
                        opened"). Replacing in place keeps it working. */}
                    <div className="rounded-md border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                        <p className="mb-1.5 flex items-center gap-1 font-medium text-foreground">
                            <SquareArrowOutUpRight className="w-3 h-3" />
                            Installing the update
                        </p>
                        <ol className="list-decimal space-y-1 pl-4 leading-relaxed marker:text-muted-foreground/70">
                            <li>Quit SnapDown.</li>
                            <li>Open the downloaded .dmg and drag SnapDown onto Applications.</li>
                            <li>
                                Choose <span className="font-medium text-foreground">Replace</span> when macOS asks.
                                Don&rsquo;t delete the old app first — that&rsquo;s what leaves a dead icon in your Dock.
                            </li>
                            <li>Reopen SnapDown.</li>
                        </ol>
                        <p className="mt-2 leading-relaxed">
                            Your library and downloads live outside the app, so updating never touches them.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
