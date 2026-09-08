"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrainCircuit, Mic } from "lucide-react";
import type { SettingsState, SetSettings } from "./types";

const PROVIDER_LABELS: Record<string, string> = { openai: "OpenAI", groq: "Groq" };

interface AiTranscriptionCardProps {
    settings: SettingsState;
    setSettings: SetSettings;
    onSave: () => void;
}

export function AiTranscriptionCard({ settings, setSettings, onSave }: AiTranscriptionCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-primary" />
                    AI Transcription
                </CardTitle>
                <CardDescription>
                    Speech-to-text via OpenAI or Groq. Keys stay on your machine.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="transcriptionProvider">Provider</Label>
                    <Select
                        value={settings.transcriptionProvider}
                        onValueChange={(value) =>
                            setSettings({
                                ...settings,
                                transcriptionProvider: value as "openai" | "groq",
                            })
                        }
                    >
                        <SelectTrigger id="transcriptionProvider">
                            <SelectValue placeholder="Select provider">{(v) => PROVIDER_LABELS[String(v)] ?? "OpenAI"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="openai">OpenAI</SelectItem>
                            <SelectItem value="groq">Groq</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="openaiKey" className="flex items-center gap-2">
                        <Mic className="w-3.5 h-3.5 text-muted-foreground" />
                        OpenAI API Key
                    </Label>
                    <Input
                        id="openaiKey"
                        type="password"
                        placeholder="sk-..."
                        value={settings.openaiApiKey}
                        onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Get a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">platform.openai.com</a>.</p>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="groqKey" className="flex items-center gap-2">
                        <Mic className="w-3.5 h-3.5 text-muted-foreground" />
                        Groq API Key
                    </Label>
                    <Input
                        id="groqKey"
                        type="password"
                        placeholder="gsk_..."
                        value={settings.groqApiKey}
                        onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Get a key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">console.groq.com</a>.</p>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="whisperLang">Language (optional)</Label>
                    <Input
                        id="whisperLang"
                        placeholder="e.g. en, ar, es (leave blank for auto-detect)"
                        value={settings.whisperLanguage}
                        onChange={(e) => setSettings({ ...settings, whisperLanguage: e.target.value })}
                    />
                </div>
                <div className="flex justify-end">
                    <Button onClick={onSave}>Save</Button>
                </div>
            </CardContent>
        </Card>
    );
}
