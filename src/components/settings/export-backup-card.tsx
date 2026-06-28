"use client";

import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, Database } from "lucide-react";

export function ExportBackupCard() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                    <FileDown className="w-5 h-5 text-primary" />
                    Export & Backup
                </CardTitle>
                <CardDescription>Export metadata or back up the database.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                        <span className="text-[10px] text-muted-foreground">Structured metadata</span>
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
                        <span className="text-[10px] text-muted-foreground">Spreadsheet format</span>
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
                        <span className="text-[10px] text-muted-foreground">Raw SQLite file</span>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
