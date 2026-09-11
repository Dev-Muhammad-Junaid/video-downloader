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
import { useInAppUpdate } from "@/hooks/use-in-app-update";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";

/** Sidebar footer entry: shows nothing until an update is actually available,
 *  then a small badged button that opens the changelog + download dialog. Not
 *  auto-update — the user decides if/when to grab the new build themselves. */
export function UpdateNotifier() {
    const info = useUpdateCheck();
    const [open, setOpen] = useState(false);
    const { available: canSelfUpdate, phase, progress, error, install } = useInAppUpdate();
    const busy = phase !== "idle" && phase !== "error";

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

                    {/* In the desktop app the update installs itself; the
                        manual download stays available as a fallback and for
                        anyone who'd rather do it by hand. */}
                    {canSelfUpdate && phase !== "error" && (
                        <div className="pt-2">
                            {busy ? (
                                <div className="rounded-md border bg-muted/40 p-3">
                                    <p className="flex items-center gap-2 text-[12px] font-medium text-foreground">
                                        {phase === "verifying"
                                            ? <ShieldCheck className="size-3.5 text-primary" />
                                            : <Loader2 className="size-3.5 animate-spin text-primary" />}
                                        {phase === "locating" && "Finding the latest release\u2026"}
                                        {phase === "downloading" && "Downloading\u2026"}
                                        {phase === "verifying" && "Checking the download is genuine\u2026"}
                                        {phase === "installing" && "Installing \u2014 SnapDown will reopen itself"}
                                    </p>
                                    {phase === "downloading" && progress && progress.total > 0 && (
                                        <>
                                            <Progress value={(progress.received / progress.total) * 100} className="mt-2 h-1.5" />
                                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                                                {(progress.received / 1048576).toFixed(0)} of {(progress.total / 1048576).toFixed(0)} MB
                                            </p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <Button className="w-full gap-1.5" onClick={install}>
                                        <Download className="size-3.5" />
                                        Update and restart
                                    </Button>
                                    <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                                        SnapDown will download the update, verify its signature, replace itself and reopen.
                                        Your library and downloads are stored outside the app and aren&rsquo;t touched.
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-[11px] leading-relaxed text-destructive">
                            <AlertTriangle className="mt-px size-3.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className={cn("flex items-center gap-2", canSelfUpdate ? "pt-1" : "pt-2")}>
                        <a
                            href={info.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                buttonVariants({ variant: canSelfUpdate ? "outline" : "default" }),
                                "flex-1 gap-1.5",
                            )}
                        >
                            <Download className="size-3.5" />
                            {canSelfUpdate ? "Download manually" : "Download for macOS"}
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

                    {!canSelfUpdate && (
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
                                    Don&rsquo;t delete the old app first \u2014 that&rsquo;s what leaves a dead icon in your Dock.
                                </li>
                                <li>Reopen SnapDown.</li>
                            </ol>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
