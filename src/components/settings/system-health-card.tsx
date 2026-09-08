"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Terminal, RefreshCw, ChevronDown, Loader2, Check, X, Minus, Info, Copy } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";

/** Shape returned by /api/settings/preflight. */
interface BinaryCheck {
    name: string;
    available: boolean;
    version: string | null;
    path: string | null;
    error: string | null;
    purpose: string;
    fix: string | null;
    required: boolean;
    bundled: boolean;
}

interface ProviderCheck {
    name: string;
    configured: boolean;
    reachable: boolean | null;
    error: string | null;
    purpose: string;
    fix: string | null;
}

export interface Preflight {
    binaries: Record<string, BinaryCheck>;
    providers: Record<string, ProviderCheck>;
}

interface SystemHealthCardProps {
    preflight: Preflight | null;
    preflightLoading: boolean;
    runPreflight: () => void;
    healthExpanded: boolean;
    setHealthExpanded: (b: boolean) => void;
}

type CheckState = "ok" | "missing" | "skipped";

interface HealthItem {
    name: string;
    state: CheckState;
    detail: string;
    /** What the dependency is for — shown behind the info icon. */
    purpose: string;
    /** How to resolve it; a shell command for binaries, a pointer for providers. */
    fix: string | null;
    /** A shell command can be copied; a "go to Settings > X" pointer cannot. */
    fixIsCommand: boolean;
    required: boolean;
}

/** Flattens the preflight payload into one uniform list. Binaries report
 *  `available`/`version`; providers report `configured`/`reachable` — the card
 *  shouldn't have to care which kind it's drawing. */
function toItems(preflight: Preflight | null): HealthItem[] {
    if (!preflight) return [];

    const binaries: HealthItem[] = Object.values(preflight.binaries ?? {}).map((b) => ({
        name: b.name,
        state: b.available ? "ok" : "missing",
        detail: b.available
            ? (b.version ? `Version ${b.version}` : "Installed")
            : (b.error || "Not found"),
        purpose: b.bundled && b.available ? `${b.purpose} Included with SnapDown.` : b.purpose,
        fix: b.available ? null : b.fix,
        fixIsCommand: true,
        required: b.required,
    }));

    const providers: HealthItem[] = Object.values(preflight.providers ?? {}).map((p) => ({
        name: p.name,
        state: !p.configured ? "skipped" : p.reachable ? "ok" : "missing",
        detail: !p.configured ? "Not configured" : p.reachable ? "Connected" : (p.error || "Unreachable"),
        purpose: p.purpose,
        fix: p.reachable ? null : p.fix,
        fixIsCommand: false,
        required: false,
    }));

    return [...binaries, ...providers];
}

const ICON: Record<CheckState, typeof Check> = { ok: Check, missing: X, skipped: Minus };
const TINT: Record<CheckState, string> = {
    ok: "text-chart-2",
    missing: "text-destructive",
    skipped: "text-muted-foreground/50",
};

export function SystemHealthCard({ preflight, preflightLoading, runPreflight, healthExpanded, setHealthExpanded }: SystemHealthCardProps) {
    const items = toItems(preflight);
    const missing = items.filter((i) => i.state === "missing").length;
    const ready = items.filter((i) => i.state === "ok").length;

    return (
        <Card className="gap-0 py-0">
            <div
                className="flex cursor-pointer select-none items-center justify-between gap-3 px-3.5 py-2.5"
                onClick={() => setHealthExpanded(!healthExpanded)}
            >
                <div className="flex min-w-0 items-center gap-2.5">
                    <Terminal className="size-4 shrink-0 text-primary" />
                    <span className="text-[13px] font-semibold tracking-[-0.01em]">System Health</span>
                    {preflightLoading ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    ) : items.length > 0 && (
                        // A short sentence beats a row of coloured dots: it says what
                        // the state actually is without needing a legend.
                        <span className={cn("truncate text-[12px]", missing > 0 ? "text-destructive" : "text-muted-foreground")}>
                            {missing > 0
                                ? `${missing} ${missing === 1 ? "issue" : "issues"}`
                                : `${ready} of ${items.length} ready`}
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground"
                        onClick={(e) => { e.stopPropagation(); runPreflight(); }}
                        disabled={preflightLoading}
                    >
                        <RefreshCw className="size-3" /> Re-check
                    </Button>
                    <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", healthExpanded && "rotate-180")} />
                </div>
            </div>

            {healthExpanded && items.length > 0 && (
                // One row per dependency: a status glyph, the full name (never
                // truncated), and the detail trailing. A plain list on the card's
                // own surface — no per-row tinted panel.
                <ul className="border-t">
                    {items.map((item) => {
                        const Glyph = ICON[item.state];
                        return (
                            <li
                                key={item.name}
                                className="px-3.5 py-2 text-[13px] not-last:border-b not-last:border-border/60"
                            >
                                <div className="flex items-center gap-2.5">
                                    <Glyph className={cn("size-3.5 shrink-0", TINT[item.state])} strokeWidth={3} />
                                    <span className={cn("font-medium", item.state === "skipped" && "text-muted-foreground")}>
                                        {item.name}
                                    </span>
                                    {/* What the dependency is actually for — the list says
                                        whether things are present, this says why they matter. */}
                                    <Tooltip>
                                        <TooltipTrigger
                                            aria-label={`What ${item.name} is used for`}
                                            className="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                                        >
                                            <Info className="size-3.5" />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[280px] leading-relaxed">
                                            {item.purpose}
                                        </TooltipContent>
                                    </Tooltip>
                                    {item.state === "missing" && item.required && (
                                        <span className="rounded-full bg-destructive/12 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.04em] text-destructive">
                                            Required
                                        </span>
                                    )}
                                    <span className="tabular ml-auto truncate pl-3 text-right text-[12px] text-muted-foreground">
                                        {item.detail}
                                    </span>
                                </div>

                                {/* Remediation, shown only when something needs doing. A
                                    shell command is copyable; a pointer into Settings isn't. */}
                                {item.fix && (
                                    <div className="mt-1.5 flex items-center gap-2 pl-6">
                                        {item.fixIsCommand ? (
                                            <>
                                                <code className="min-w-0 flex-1 truncate rounded-[5px] bg-muted px-2 py-1 font-mono text-[11px] text-foreground/80">
                                                    {item.fix}
                                                </code>
                                                <Button
                                                    variant="outline"
                                                    size="xs"
                                                    className="gap-1"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(item.fix as string);
                                                        toast.success("Command copied — paste it into Terminal");
                                                    }}
                                                >
                                                    <Copy /> Copy
                                                </Button>
                                            </>
                                        ) : (
                                            <span className="text-[11px] text-muted-foreground">{item.fix}</span>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}
