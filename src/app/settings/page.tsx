"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Download, Eye } from "lucide-react";
import { SystemHealthCard } from "@/components/settings/system-health-card";
import { FolderSettingCard } from "@/components/settings/folder-setting-card";
import { R2CredentialsCard } from "@/components/settings/r2-credentials-card";
import { ExportBackupCard } from "@/components/settings/export-backup-card";
import { AiTranscriptionCard } from "@/components/settings/ai-transcription-card";
import { ProfilesCard } from "@/components/settings/profiles-card";
import { LabelSyncCard } from "@/components/settings/label-sync-card";
import { BrowserIntegrationsCard } from "@/components/settings/browser-integrations-card";
import { DownloaderCard } from "@/components/settings/downloader-card";
import { DeveloperCreditCard } from "@/components/settings/developer-credit-card";
import type { SettingsState } from "@/components/settings/types";

/** Group heading between settings cards — the small, quiet, uppercase label
 *  macOS uses to separate sections of a settings list. */
function SettingsSection({ title }: { title: string }) {
    return (
        <h2 className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground select-none first:mt-0">
            {title}
        </h2>
    );
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<SettingsState>({
        s3Endpoint: "",
        s3Bucket: "",
        s3AccessKey: "",
        s3SecretKey: "",
        s3Region: "auto",
        storageLimit: 10,
        watchFolder: "",
        destinationFolder: "",
        urlExpiry: 604800,
        transcriptionProvider: "openai",
        openaiApiKey: "",
        groqApiKey: "",
        whisperLanguage: "",
        ytCookiesBrowser: "",
    });
    const [pickingFolder, setPickingFolder] = useState<"watch" | "destination" | null>(null);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [labels, setLabels] = useState<any[]>([]);
    const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [baseUrl, setBaseUrl] = useState('');
    const [preflight, setPreflight] = useState<any>(null);
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [healthExpanded, setHealthExpanded] = useState(false);

    useEffect(() => {
        setBaseUrl(window.location.origin);

        // Fetch everything from server APIs
        Promise.all([
            fetch("/api/settings/destination").then(res => res.json()),
            fetch("/api/profiles").then(res => res.json()),
            fetch("/api/labels").then(res => res.json()),
            fetch("/api/settings/r2").then(res => res.json()),
            fetch("/api/settings/ai").then(res => res.json()),
            fetch("/api/settings/watch").then(res => res.json()),
            fetch("/api/settings/ytdlp").then(res => res.json()),
        ]).then(([destData, profilesData, labelsData, r2Data, aiData, watchData, ytdlpData]) => {
            setSettings(s => ({
                ...s,
                destinationFolder: destData.path || "",
                ...(r2Data?.s3Endpoint ? r2Data : {}),
                transcriptionProvider: aiData.provider || "openai",
                openaiApiKey: aiData.hasOpenAiKey ? aiData.openaiApiKey : "",
                groqApiKey: aiData.hasGroqKey ? aiData.groqApiKey : "",
                whisperLanguage: aiData.whisperLanguage || "",
                watchFolder: watchData.watchFolder || "",
                ytCookiesBrowser: ytdlpData?.ytCookiesBrowser || "",
            }));
            if (Array.isArray(profilesData)) setProfiles(profilesData);
            if (Array.isArray(labelsData)) setLabels(labelsData);
            setIsLoading(false);
        }).catch(err => {
            console.error(err);
            setIsLoading(false);
        });
    }, []);

    const runPreflight = async () => {
        setPreflightLoading(true);
        try {
            const res = await fetch("/api/settings/preflight", { method: "POST" });
            if (res.ok) setPreflight(await res.json());
            else toast.error("Preflight check failed");
        } catch {
            toast.error("Preflight check error");
        } finally {
            setPreflightLoading(false);
        }
    };

    useEffect(() => { runPreflight(); }, []);

    const handleSaveCredentials = async () => {
        const creds = {
            s3Endpoint: settings.s3Endpoint,
            s3Bucket: settings.s3Bucket,
            s3AccessKey: settings.s3AccessKey,
            s3SecretKey: settings.s3SecretKey,
            s3Region: settings.s3Region,
            urlExpiry: settings.urlExpiry,
            storageLimit: settings.storageLimit,
        };

        try {
            const res = await fetch("/api/settings/r2", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(creds),
            });
            if (res.ok) {
                toast.success("R2 credentials saved");
            } else {
                toast.error("Failed to save R2 credentials");
            }
        } catch {
            toast.error("Failed to save R2 credentials");
        }
    };

    const handleSaveWatchFolder = async () => {
        try {
            const res = await fetch("/api/settings/watch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ watchFolder: settings.watchFolder }),
            });
            if (res.ok) {
                toast.success("Watch folder saved");
            } else {
                toast.error("Failed to save watch folder");
            }
        } catch {
            toast.error("Failed to save watch folder");
        }
    };

    const handleSaveDestination = async () => {
        try {
            const res = await fetch("/api/settings/destination", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: settings.destinationFolder }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success("Download destination saved");
            } else {
                toast.error(data.error || "Failed to save destination");
            }
        } catch {
            toast.error("Failed to save destination");
        }
    };

    const handlePickFolder = async (type: "watch" | "destination") => {
        setPickingFolder(type);
        try {
            const res = await fetch("/api/folder-picker");
            const data = await res.json();
            if (data.path) {
                if (type === "watch") {
                    setSettings(s => ({ ...s, watchFolder: data.path }));
                } else {
                    setSettings(s => ({ ...s, destinationFolder: data.path }));
                }
                toast.success("Folder selected");
            } else if (data.error) {
                toast.error(data.error);
            }
        } catch {
            toast.error("Failed to open folder picker");
        } finally {
            setPickingFolder(null);
        }
    };

    const handleSaveAi = async () => {
        try {
            const res = await fetch("/api/settings/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: settings.transcriptionProvider,
                    openaiApiKey: settings.openaiApiKey,
                    groqApiKey: settings.groqApiKey,
                    whisperLanguage: settings.whisperLanguage,
                }),
            });
            if (res.ok) toast.success("AI settings saved");
            else toast.error("Failed to save AI settings");
        } catch {
            toast.error("Failed to save AI settings");
        }
    };

    const handleSaveYtdlp = async () => {
        try {
            const res = await fetch("/api/settings/ytdlp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ytCookiesBrowser: settings.ytCookiesBrowser }),
            });
            if (res.ok) toast.success("Downloader settings saved");
            else toast.error("Failed to save downloader settings");
        } catch {
            toast.error("Failed to save downloader settings");
        }
    };

    const handleResetProfiles = async () => {
        try {
            const res = await fetch("/api/profiles/reset", { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                setProfiles(data.profiles || []);
                if (data.added?.length > 0) {
                    toast.success(`Added ${data.added.length} preset${data.added.length > 1 ? "s" : ""}: ${data.added.join(", ")}`);
                } else {
                    toast.info("All presets are already present");
                }
            } else {
                toast.error(data.error || "Reset failed");
            }
        } catch { toast.error("Reset failed"); }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProfile?.name?.trim()) {
            toast.error("Profile name is required");
            return;
        }
        const method = editingProfile?.id ? "PATCH" : "POST";
        const url = editingProfile?.id ? `/api/profiles/${editingProfile.id}` : "/api/profiles";

        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editingProfile),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error || `Failed to save profile (HTTP ${res.status})`);
                return;
            }
            if (method === "POST") setProfiles([...profiles, data]);
            else setProfiles(profiles.map(p => p.id === data.id ? data : p));
            // Refresh full list so demoted defaults show their new priority correctly.
            fetch("/api/profiles").then(r => r.json()).then(list => { if (Array.isArray(list)) setProfiles(list); }).catch(() => {});
            setIsProfileDialogOpen(false);
            toast.success("Profile saved");
        } catch (err: any) {
            toast.error(err?.message || "Failed to save profile");
        }
    };

    const handleDeleteProfile = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        try {
            const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
            if (res.ok) {
                setProfiles(profiles.filter(p => p.id !== id));
                toast.success("Profile deleted");
            } else {
                const d = await res.json();
                toast.error(d.error || "Failed to delete");
            }
        } catch {
            toast.error("Delete failed");
        }
    };

    const handleToggleLabelSync = async (label: any) => {
        const newValue = !label.autoCloudSync;
        try {
            const res = await fetch(`/api/labels/${label.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ autoCloudSync: newValue }),
            });
            if (res.ok) {
                setLabels(labels.map(l => l.id === label.id ? { ...l, autoCloudSync: newValue } : l));
                toast.success(`Auto-sync ${newValue ? 'enabled' : 'disabled'} for ${label.name}`);
            }
        } catch {
            toast.error("Failed to update label");
        }
    };

    const stagger = {
        hidden: {},
        show: { transition: { staggerChildren: 0.07 } },
    };
    const fadeUp = {
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 24, stiffness: 180 } },
    };

    // isLoading is tracked for the initial settings fetch (reserved for future
    // loading UI); referenced here to keep the value live without a UI change.
    void isLoading;

    return (
        <div className="mx-auto w-full max-w-[860px] px-6 py-5">
            <motion.div
                variants={stagger}
                initial="hidden"
                animate="show"
                className="flex flex-col gap-4"
            >
                {/* System Health / Preflight — compact collapsible */}
                <motion.div variants={fadeUp}>
                    <SystemHealthCard
                        preflight={preflight}
                        preflightLoading={preflightLoading}
                        runPreflight={runPreflight}
                        healthExpanded={healthExpanded}
                        setHealthExpanded={setHealthExpanded}
                    />
                </motion.div>

                <SettingsSection title="Folders" />

                {/* Destination Folder */}
                <motion.div variants={fadeUp}>
                    <FolderSettingCard
                        icon={<Download className="size-4 text-primary" />}
                        title="Download Destination"
                        description="Where downloaded files are saved."
                        inputId="destinationFolder"
                        placeholder="/Users/username/Downloads/videos"
                        value={settings.destinationFolder}
                        onChange={(v) => setSettings(s => ({ ...s, destinationFolder: v }))}
                        onPick={() => handlePickFolder("destination")}
                        picking={pickingFolder === "destination"}
                        onSave={handleSaveDestination}
                        saveLabel="Save"
                    />
                </motion.div>

                {/* Watch Folder */}
                <motion.div variants={fadeUp}>
                    <FolderSettingCard
                        icon={<Eye className="size-4 text-primary" />}
                        title="Watch Folder"
                        description="Files dropped here are auto-imported. Keep it separate from your download folder."
                        inputId="watchFolder"
                        placeholder="/Users/username/Videos/watch"
                        value={settings.watchFolder}
                        onChange={(v) => setSettings(s => ({ ...s, watchFolder: v }))}
                        onPick={() => handlePickFolder("watch")}
                        picking={pickingFolder === "watch"}
                        onSave={handleSaveWatchFolder}
                        saveLabel="Save"
                    />
                </motion.div>

                <SettingsSection title="Downloading" />

                {/* Downloader cookies (YouTube bot-check / quality) */}
                <motion.div variants={fadeUp}>
                    <DownloaderCard
                        ytCookiesBrowser={settings.ytCookiesBrowser}
                        setYtCookiesBrowser={(v) => setSettings(s => ({ ...s, ytCookiesBrowser: v }))}
                        onSave={handleSaveYtdlp}
                    />
                </motion.div>

                {/* Quality & Format Profiles (WID-306) */}
                <motion.div variants={fadeUp}>
                    <ProfilesCard
                        profiles={profiles}
                        editingProfile={editingProfile}
                        setEditingProfile={setEditingProfile}
                        isProfileDialogOpen={isProfileDialogOpen}
                        setIsProfileDialogOpen={setIsProfileDialogOpen}
                        onSaveProfile={handleSaveProfile}
                        onDeleteProfile={handleDeleteProfile}
                        onReset={handleResetProfiles}
                    />
                </motion.div>

                {/* AI Transcription Settings (WID-307) */}
                <motion.div variants={fadeUp}>
                    <AiTranscriptionCard settings={settings} setSettings={setSettings} onSave={handleSaveAi} />
                </motion.div>

                <SettingsSection title="Cloud" />

                {/* Cloudflare R2 Credentials */}
                <motion.div variants={fadeUp}>
                    <R2CredentialsCard settings={settings} setSettings={setSettings} onSave={handleSaveCredentials} />
                </motion.div>

                {/* Auto Cloud-Sync by Label (WID-306) */}
                <motion.div variants={fadeUp}>
                    <LabelSyncCard labels={labels} onToggle={handleToggleLabelSync} />
                </motion.div>

                <SettingsSection title="Data & Integrations" />

                {/* Export & Backup */}
                <motion.div variants={fadeUp}>
                    <ExportBackupCard />
                </motion.div>

                {/* Browser Integration (WID-300) */}
                <motion.div variants={fadeUp}>
                    <BrowserIntegrationsCard baseUrl={baseUrl} />
                </motion.div>

                {/* Developer credit / contribute links */}
                <motion.div variants={fadeUp}>
                    <DeveloperCreditCard />
                </motion.div>
            </motion.div>
        </div>
    );
}