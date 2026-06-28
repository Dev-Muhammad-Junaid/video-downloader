"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface BrowserIntegrationsCardProps {
    baseUrl: string;
}

export function BrowserIntegrationsCard({ baseUrl }: BrowserIntegrationsCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" />
                    Browser Integrations
                </CardTitle>
                <CardDescription>Send videos directly to SnapDown while browsing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Bookmarklet */}
                    <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border/60">
                        <h3 className="font-semibold text-lg">1. Universal Bookmarklet</h3>
                        <p className="text-sm text-muted-foreground">Drag to your bookmarks bar, then click it on any video page. Works on desktop & mobile.</p>

                        <div className="flex items-center justify-center p-6 border border-dashed border-border/50 rounded-lg bg-card/30">
                            <div
                                dangerouslySetInnerHTML={{
                                    __html: `<a href="javascript:(function(){window.open('${baseUrl}/?url='+encodeURIComponent(window.location.href),'_blank');})();" class="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground h-8 px-2.5 text-sm font-medium shadow-lg hover:scale-105 transition-transform cursor-move" onclick="event.preventDefault()">⬇️ Send to SnapDown</a>`
                                }}
                            />
                        </div>
                    </div>

                    {/* Chrome Extension */}
                    <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border/60">
                        <h3 className="font-semibold text-lg">2. Chrome/Edge Extension</h3>
                        <p className="text-sm text-muted-foreground">Downloads without opening new tabs.</p>
                        <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-2">
                            <li>Go to <strong>chrome://extensions</strong> and enable <strong>Developer Mode</strong>.</li>
                            <li>Click <strong>Load unpacked</strong> and select the <code>extension/</code> folder.</li>
                            <li>Click the extension icon on any video page.</li>
                        </ol>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
