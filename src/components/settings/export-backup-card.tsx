"use client";

import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FileDown, Database, Info } from "lucide-react";

export function ExportBackupCard() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileDown className="w-5 h-5 text-primary" />
                    Export & Backup
                    <Tooltip>
                        <TooltipTrigger className="text-muted-foreground hover:text-foreground cursor-help">
                            <Info className="w-4 h-4" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px]">
                            JSON/CSV export structured metadata for your library; Backup DB downloads the raw SQLite file.
                        </TooltipContent>
                    </Tooltip>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col items-center gap-2"
                        onClick={() => {
                            window.location.href = "/api/export?format=json";
                            toast.success("JSON export started");
                        }}
                    >
                        <FileDown className="w-6 h-6 text-blue-500" />
                        <span className="font-medium">Export JSON</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col items-center gap-2"
                        onClick={() => {
                            window.location.href = "/api/export?format=csv";
                            toast.success("CSV export started");
                        }}
                    >
                        <FileDown className="w-6 h-6 text-emerald-500" />
                        <span className="font-medium">Export CSV</span>
                    </Button>
                    <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col items-center gap-2"
                        onClick={() => {
                            window.location.href = "/api/export?format=db";
                            toast.success("Database backup started");
                        }}
                    >
                        <Database className="w-6 h-6 text-amber-500" />
                        <span className="font-medium">Backup DB</span>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
