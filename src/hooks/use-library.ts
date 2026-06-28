"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Video } from "@/types/media";

/**
 * Owns the media library: the list of videos, labels, and all the
 * data-fetching / mutation handlers that operate on them (transcribe, delete,
 * cloud sync, labels, rename helpers). Extracted verbatim from page.tsx so the
 * page becomes composition; behaviour is unchanged.
 */
export function useLibrary() {
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    // Labels
    const [globalLabels, setGlobalLabels] = useState<{ id: string; name: string; color: string | null }[]>([]);
    const [newLabelName, setNewLabelName] = useState("");

    // Transcription
    const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
    const [transcriptionProvider, setTranscriptionProvider] = useState<"openai" | "groq">("openai");

    const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

    const pollingRefs = React.useRef<{ [key: string]: NodeJS.Timeout }>({});

    const fetchLibrary = async () => {
        try {
            const res = await fetch("/api/library");
            if (!res.ok) throw new Error("Failed to fetch library");
            const data = await res.json();
            setVideos(data);
        } catch (error) {
            toast.error("Error loading library");
        } finally {
            setLoading(false);
        }
    };

    const fetchLabels = async () => {
        try {
            const res = await fetch("/api/labels");
            if (res.ok) {
                const data = await res.json();
                setGlobalLabels(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        const init = async () => {
            // Fetch watch folder from server settings
            try {
                const watchRes = await fetch("/api/settings/watch");
                if (watchRes.ok) {
                    const { watchFolder } = await watchRes.json();
                    if (watchFolder) {
                        fetch("/api/library/scan", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ folderPath: watchFolder }),
                        }).then(() => fetchLibrary()).catch(console.error);
                    }
                }
            } catch { /* ignore */ }
            fetchLibrary();
            fetchLabels();
            fetch("/api/settings/ai")
                .then((r) => r.json())
                .then((data) => {
                    if (data?.provider === "openai" || data?.provider === "groq") {
                        setTranscriptionProvider(data.provider);
                    }
                })
                .catch(() => {});

            // Auto-backfill thumbnails for old videos that don't have one
            fetch("/api/thumbnail/backfill", { method: "POST" })
                .then(r => r.json())
                .then(data => {
                    if (data.generated > 0) {
                        console.log(`Backfilled ${data.generated} thumbnails`);
                        fetchLibrary(); // refresh to show newly generated thumbnails
                    }
                })
                .catch(console.error);
        };
        init();

        const refs = pollingRefs.current;
        return () => {
            Object.values(refs).forEach(clearInterval);
        };
    }, []);

    // WID-307: Transcribe a single video
    const handleTranscribe = async (videoId: string) => {
        setTranscribingIds(prev => new Set(prev).add(videoId));
        try {
            await api.post(`/api/transcription/${videoId}`, {});
            toast.info("Transcription started — this may take a moment...");
            // Poll until done — tracked in pollingRefs for cleanup
            let pollCount = 0;
            const poll = setInterval(async () => {
                pollCount++;
                if (pollCount > 100) {
                    clearInterval(poll);
                    delete pollingRefs.current[`transcribe-${videoId}`];
                    setTranscribingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
                    toast.error("Transcription polling timed out");
                    return;
                }
                try {
                    const statusRes = await fetch(`/api/transcription/${videoId}`);
                    const statusData = await statusRes.json();
                    if (statusData.status === "completed") {
                        clearInterval(poll);
                        delete pollingRefs.current[`transcribe-${videoId}`];
                        setTranscribingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
                        toast.success("Transcription complete! You can now deep search this video.");
                        setVideos(prev => prev.map(v => v.id === videoId ? { ...v, transcriptStatus: "completed", transcriptText: statusData.text } : v));
                    } else if (statusData.status === "error") {
                        clearInterval(poll);
                        delete pollingRefs.current[`transcribe-${videoId}`];
                        setTranscribingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
                        toast.error("Transcription failed for this video");
                        setVideos(prev => prev.map(v => v.id === videoId ? { ...v, transcriptStatus: "error" } : v));
                    }
                } catch { /* ignore */ }
            }, 3000);
            pollingRefs.current[`transcribe-${videoId}`] = poll;
        } catch (err: any) {
            setTranscribingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
            toast.error(err.message);
        }
    };

    const handleOpenFolder = async (path: string) => {
        try {
            const res = await fetch("/api/library/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "open", targetPath: path }),
            });
            if (res.ok) {
                toast.success("Opened in Explorer");
            } else {
                toast.error("Failed to open folder");
            }
        } catch {
            toast.error("Action error");
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Path copied to clipboard");
        } catch {
            toast.error("Failed to copy path");
        }
    };

    const handleCloudUpload = async (video: Video) => {
        const toastId = toast.loading(`Uploading ${video.title}...`);
        try {
            const res = await fetch("/api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: video.id }),
            });

            const result = await res.json();
            if (res.ok && result.success) {
                toast.success(`Uploaded successfully`, { id: toastId });
                // Optimistic update
                setVideos(prev => prev.map(v => v.id === video.id ? { ...v, cloudKey: result.key, cloudUrl: result.cloudUrl, cloudUploadedAt: new Date().toISOString() } : v));
            } else {
                toast.error(`Upload failed: ${result.error}`, { id: toastId });
            }
        } catch {
            toast.error("Upload failed", { id: toastId });
        }
    };

    const handleCloudRemove = async (video: Video) => {
        if (!confirm(`Remove "${video.title}" from cloud storage? The local file will not be affected.`)) return;

        const toastId = toast.loading(`Removing from cloud...`);
        try {
            const res = await fetch("/api/sync", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: video.id }),
            });

            const result = await res.json();
            if (res.ok && result.success) {
                toast.success(`Removed from cloud`, { id: toastId });
                // Optimistic update
                setVideos(prev => prev.map(v => v.id === video.id ? { ...v, cloudKey: null, cloudUrl: null, cloudUploadedAt: null } : v));
            } else {
                toast.error(`Remove failed: ${result.error}`, { id: toastId });
            }
        } catch {
            toast.error("Remove from cloud failed", { id: toastId });
        }
    };

    const openDeleteDialog = (videoId: string, title: string) => {
        setDeleteTarget({ id: videoId, title });
    };

    const performDelete = async () => {
        if (!deleteTarget) return;
        const { id: videoId } = deleteTarget;
        setDeleteTarget(null);

        const toastId = toast.loading("Deleting video...");
        try {
            const res = await fetch(`/api/library/${videoId}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Video deleted", { id: toastId });
                setVideos(prev => prev.filter(v => v.id !== videoId));
            } else {
                toast.error("Failed to delete video", { id: toastId });
            }
        } catch {
            toast.error("Deletion error", { id: toastId });
        }
    };

    const attachLabel = async (videoId: string, labelId: string) => {
        try {
            const res = await fetch(`/api/library/${videoId}/labels`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ labelId })
            });
            if (res.ok) {
                const updatedVid = await res.json();
                setVideos(prev => prev.map(v => v.id === videoId ? { ...v, labels: updatedVid.labels } : v));
            }
        } catch (error) {
            toast.error("Failed to attach label");
        }
    };

    const detachLabel = async (videoId: string, labelId: string) => {
        try {
            const res = await fetch(`/api/library/${videoId}/labels`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ labelId })
            });
            if (res.ok) {
                const updatedVid = await res.json();
                setVideos(prev => prev.map(v => v.id === videoId ? { ...v, labels: updatedVid.labels } : v));
            }
        } catch (error) {
            toast.error("Failed to detach label");
        }
    };

    // Create a label (or reuse an existing one — the API upserts) and attach it to the
    // given item in one step, straight from the label search box.
    const createAndAttachLabel = async (videoId: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            const newLabel = await api.post<{ id: string; name: string; color: string | null }>("/api/labels", { name: trimmed, color: "#3b82f6" });
            setGlobalLabels(prev => prev.some(l => l.id === newLabel.id) ? prev : [...prev, newLabel]);
            setNewLabelName("");
            await attachLabel(videoId, newLabel.id);
            toast.success(`Added "${newLabel.name}"`);
        } catch {
            toast.error("Failed to create label");
        }
    };

    // Delete a label from the database entirely (not just detach it from one
    // item). Removes it from the global list and strips it off any loaded videos.
    const deleteLabel = async (labelId: string) => {
        try {
            await api.del(`/api/labels/${labelId}`);
            setGlobalLabels(prev => prev.filter(l => l.id !== labelId));
            setVideos(prev => prev.map(v => v.labels ? { ...v, labels: v.labels.filter(l => l.id !== labelId) } : v));
            toast.success("Label deleted");
        } catch {
            toast.error("Failed to delete label");
        }
    };

    const providerLabel = transcriptionProvider === "groq" ? "Groq" : "OpenAI";

    return {
        videos, setVideos, loading,
        globalLabels, newLabelName, setNewLabelName,
        transcribingIds, transcriptionProvider, providerLabel,
        deleteTarget, setDeleteTarget, openDeleteDialog, performDelete,
        fetchLibrary, fetchLabels,
        handleTranscribe, handleOpenFolder, copyToClipboard,
        handleCloudUpload, handleCloudRemove,
        attachLabel, detachLabel, createAndAttachLabel, deleteLabel,
    };
}
