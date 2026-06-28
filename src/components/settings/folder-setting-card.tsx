"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Loader2 } from "lucide-react";

interface FolderSettingCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    inputId: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    onPick: () => void;
    picking: boolean;
    onSave: () => void;
    saveLabel: string;
}

/** Shared card for the "Download Destination" and "Watch Folder" settings —
 *  identical layout (path input + browse + save), differing only in copy. */
export function FolderSettingCard({
    icon, title, description, inputId, placeholder, value, onChange, onPick, picking, onSave, saveLabel,
}: FolderSettingCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {icon}
                    {title}
                </CardTitle>
                <CardDescription>
                    {description}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor={inputId}>Folder Path</Label>
                    <div className="flex gap-2">
                        <Input
                            id={inputId}
                            placeholder={placeholder}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className="flex-1"
                        />
                        <Button
                            variant="outline"
                            onClick={onPick}
                            disabled={picking}
                            className="flex-shrink-0 gap-2"
                            title="Browse for folder"
                        >
                            {picking ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <FolderOpen className="w-4 h-4" />
                            )}
                            Browse
                        </Button>
                    </div>
                </div>
                <Button onClick={onSave} className="w-full">{saveLabel}</Button>
            </CardContent>
        </Card>
    );
}
