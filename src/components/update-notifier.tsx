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
import { Download, ExternalLink, RotateCw, AlertTriangle, Loader2 } from "lucide-react";
import { useUpdateCheck } from "@/hooks/use-update-check";
import { Markdown } from "@/components/ui/markdown";
import { useInAppUpdate } from "@/hooks/use-in-app-update";

/**
 * Sidebar footer entry: nothing until an update exists, then a badged button
 * that opens the changelog.
 *
 * The sidebar entry doubles as the progress indicator. Once the user starts a
 * download the dialog gets out of the way and the sidebar shows how it's going,
 * then turns into Restart when it's ready — so a long download doesn't hold a
 * modal open over the app.
 */
export function UpdateNotifier() {
    const info = useUpdateCheck();
    const [open, setOpen] = useState(false);
    const { available: canSelfUpdate, phase, percent, error, download, restart } = useInAppUpdate();

    if (!info?.updateAvailable) return null;

    const busy = phase === "locating" || phase === "downloading" || phase === "verifying";
    const ready = phase === "ready";
    const installing = phase === "installing";

    const startDownload = () => {
        setOpen(false);
        void download();
    };

    // ── Sidebar entry: indicator → progress → restart ──────────────────────
    let sidebar: React.ReactNode;

    if (busy || installing) {
        sidebar = (
            <div className="w-full px-2 py-1 group-data-[collapsible=icon]:px-0" title={
                phase === "verifying" ? "Checking the download is genuine"
                    : installing ? "Installing"
                    : `Downloading ${info.latestVersion}`
            }>
                <div className="flex items-center gap-2 text-[12px] font-medium text-primary">
                    <Loader2 className="size-3.5 shrink-0 animate-spin" />
                    <span className="truncate group-data-[collapsible=icon]:hidden">
                        {phase === "verifying" ? "Verifying"
                            : installing ? "Installing"
                            : percent !== null ? `Downloading ${percent}%` : "Downloading"}
                    </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-primary/15 group-data-[collapsible=icon]:hidden">
                    <div
                        className={cn(
                            "h-full rounded-full bg-primary transition-[width] duration-300",
                            // No determinate percentage yet (locating, verifying,
                            // installing) — show a filled bar rather than an
                            // empty one that reads as "stuck".
                            percent === null || phase !== "downloading" ? "w-full opacity-60" : "",
                        )}
                        style={phase === "downloading" && percent !== null ? { width: `${percent}%` } : undefined}
                    />
                </div>
            </div>
        );
    } else if (ready) {
        sidebar = (
            <Button
                variant="ghost"
                title={`${info.latestVersion} is ready — restart to finish`}
                className="h-[30px] w-full justify-start gap-2.5 px-2 text-[13px] font-medium text-primary hover:text-primary group-data-[collapsible=icon]:size-[30px]! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>svg]:size-[15px]"
                onClick={() => void restart()}
            >
                <RotateCw className="shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Restart to update</span>
            </Button>
        );
    } else {
        sidebar = (
            <Button
                variant="ghost"
                title={error ? `Update failed: ${error}` : `Update available: ${info.latestVersion}`}
                className={cn(
                    "relative h-[30px] w-full justify-start gap-2.5 px-2 text-[13px] font-medium group-data-[collapsible=icon]:size-[30px]! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>span>svg]:size-[15px]",
                    error ? "text-destructive hover:text-destructive" : "text-primary hover:text-primary",
                )}
                onClick={() => setOpen(true)}
            >
                <span className="relative shrink-0">
                    {error ? <AlertTriangle /> : <Download />}
                    {!error && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-sidebar" />}
                </span>
                <span className="group-data-[collapsible=icon]:hidden">
                    {error ? "Update failed" : "Update Available"}
                </span>
            </Button>
        );
    }

    return (
        <>
            {sidebar}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Download className="size-4 text-primary" />
                            SnapDown {info.latestVersion} is available
                        </DialogTitle>
                    </DialogHeader>

                    <p className="-mt-2 text-[12px] text-muted-foreground">
                        You&rsquo;re on {info.currentVersion}.
                    </p>

                    {info.changelog && (
                        <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/50 p-3">
                            <Markdown content={info.changelog} />
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-[11px] leading-relaxed text-destructive">
                            <AlertTriangle className="mt-px size-3.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        {canSelfUpdate ? (
                            <Button className="flex-1 gap-1.5" onClick={startDownload}>
                                <Download className="size-3.5" />
                                Download
                            </Button>
                        ) : (
                            <a
                                href={info.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(buttonVariants({ variant: "default" }), "flex-1 gap-1.5")}
                            >
                                <Download className="size-3.5" />
                                Download
                            </a>
                        )}
                        <a
                            href={info.releaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
                            title="View this release on GitHub"
                        >
                            <ExternalLink className="size-3.5" />
                        </a>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
