"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Tags, CloudSync, ShieldCheck } from "lucide-react";

interface LabelSyncCardProps {
    labels: any[];
    onToggle: (label: any) => void;
}

export function LabelSyncCard({ labels, onToggle }: LabelSyncCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                    <Tags className="w-5 h-5 text-primary" />
                    Auto-sync by Category
                </CardTitle>
                <CardDescription>Auto-upload videos in these categories to the cloud.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {labels.map(label => (
                        <div
                            key={label.id}
                            className={`p-3 rounded-xl border transition-all flex flex-col gap-3 ${label.autoCloudSync ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800' : 'bg-muted/30 border-border/60'}`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{label.name}</span>
                                <div
                                    className={cn("w-2 h-2 rounded-full", label.color && !label.color.startsWith('#') ? label.color : "")}
                                    style={
                                        label.color?.startsWith('#')
                                            ? { backgroundColor: label.color }
                                            : !label.color
                                                ? { backgroundColor: "#9ca3af" }
                                                : undefined
                                    }
                                />
                            </div>
                            <div className="flex items-center justify-between mt-auto">
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    {label.autoCloudSync ? <CloudSync className="w-3 h-3 text-blue-500" /> : <ShieldCheck className="w-3 h-3" />}
                                    {label.autoCloudSync ? 'Auto-syncing' : 'Local only'}
                                </span>
                                <Switch
                                    checked={!!label.autoCloudSync}
                                    onCheckedChange={() => onToggle(label)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                {labels.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">No labels yet — they appear as you download.</div>
                )}
            </CardContent>
        </Card>
    );
}
