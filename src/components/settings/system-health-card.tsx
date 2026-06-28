"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Terminal, RefreshCw, ChevronDown, Loader2, CircleCheck, CircleX, CircleDashed } from "lucide-react";

interface SystemHealthCardProps {
    preflight: any;
    preflightLoading: boolean;
    runPreflight: () => void;
    healthExpanded: boolean;
    setHealthExpanded: (b: boolean) => void;
}

export function SystemHealthCard({ preflight, preflightLoading, runPreflight, healthExpanded, setHealthExpanded }: SystemHealthCardProps) {
    return (
        <Card>
            <div
                className="flex items-center justify-between px-5 py-3 cursor-pointer select-none"
                onClick={() => setHealthExpanded(!healthExpanded)}
            >
                <div className="flex items-center gap-2.5">
                    <Terminal className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">System Health</span>
                    {preflight && !preflightLoading && (
                        <div className="flex items-center gap-1 ml-2">
                            {[...Object.values(preflight.binaries as Record<string, any>), ...Object.values(preflight.providers as Record<string, any>)].map((item: any, i) => {
                                const ok = item.available ?? (item.configured && item.reachable);
                                const skip = item.configured === false;
                                return <span key={i} className={cn("w-2 h-2 rounded-full", ok ? "bg-emerald-500" : skip ? "bg-muted-foreground/30" : "bg-destructive")} title={item.name} />;
                            })}
                        </div>
                    )}
                    {preflightLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-2" />}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground" onClick={(e) => { e.stopPropagation(); runPreflight(); }} disabled={preflightLoading}>
                        <RefreshCw className="w-3 h-3" /> Re-check
                    </Button>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", healthExpanded && "rotate-180")} />
                </div>
            </div>
            {healthExpanded && preflight && (
                <div className="px-5 pb-4 pt-0">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        {[...Object.values(preflight.binaries as Record<string, any>), ...Object.values(preflight.providers as Record<string, any>)].map((item: any) => {
                            const ok = item.available ?? (item.configured && item.reachable);
                            const skip = item.configured === false;
                            return (
                                <div key={item.name} className={cn(
                                    "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs",
                                    ok ? "border-emerald-500/20 bg-emerald-500/5" : skip ? "border-border/50 bg-muted/20" : "border-destructive/20 bg-destructive/5"
                                )}>
                                    {ok ? <CircleCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : skip ? <CircleDashed className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <CircleX className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{item.name}</div>
                                        <div className="text-[10px] text-muted-foreground truncate">{ok ? (item.version || "OK") : skip ? "Not set" : (item.error || "Error")}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </Card>
    );
}
