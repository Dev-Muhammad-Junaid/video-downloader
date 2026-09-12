"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { QueueItem, DownloadProfile } from "@/types/media";

/**
 * Owns the download/export queue: optimistic queue state, profile matching,
 * link parsing, job start/retry, and live progress (SSE + polling fallback).
 * Extracted verbatim from page.tsx. `refreshLibrary` is called when a job
 * completes so the library re-fetches (the one cross-concern dependency).
 */
export function useDownloadQueue({ refreshLibrary }: { refreshLibrary: () => void }) {
    /**
     * Job ids whose completion has already been announced.
     *
     * Completion used to be detected only as a STATE TRANSITION inside the SSE
     * handler: a job had to already be in the local queue as "processing" when
     * a "completed" message arrived. Anything that finished before the UI saw
     * it running was skipped, because the handler early-returns when the
     * incoming status already matches local state — so the library was never
     * refreshed and the new file didn't appear until a manual reload.
     *
     * Exports hit this constantly. A trim is a stream copy and finishes in well
     * under the five second queue poll, so the job routinely first appears
     * already completed.
     *
     * Tracking announced ids instead makes the refresh depend on the fact of
     * completion rather than on having observed the moment it happened, and
     * works the same whether the news arrives by SSE or by poll.
     */
    const announcedCompletionsRef = React.useRef<Set<string>>(new Set());
    const completionsSeededRef = React.useRef(false);
    const [urlText, setUrlText] = useState("");
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [profiles, setProfiles] = useState<DownloadProfile[]>([]);
    const [selectedQueueProfile, setSelectedQueueProfile] = useState<string>("default-auto");
    const [queueFilter, setQueueFilter] = useState<"all" | "active" | "failed">("all");
    const [retryingQueueIds, setRetryingQueueIds] = useState<Set<string>>(new Set());

    const pollingRefs = React.useRef<{ [key: string]: NodeJS.Timeout }>({});
    const sseRef = React.useRef<EventSource | null>(null);

    const matchProfileForUrl = useCallback((url: string) => {
        for (const profile of profiles.filter((p) => p.isActive)) {
            if (!profile.sitePattern || profile.sitePattern === "*") continue;
            try {
                const regex = new RegExp(profile.sitePattern.replace(/\*/g, ".*"), "i");
                if (regex.test(url)) return profile;
            } catch {
                if (url.includes(profile.sitePattern)) return profile;
            }
        }
        return profiles.find((p) => p.sitePattern === "*" || p.priority === -1);
    }, [profiles]);

    const pickFormatForProfile = useCallback((item: QueueItem, profile: DownloadProfile) => {
        const formats = item.formats || [];

        // Audio output: an audio-only profile (extractAudio), an audio source, or a legacy
        // audio-format profile. yt-dlp's -x extracts audio from any video.
        const legacyAudio = ["mp3", "m4a", "wav"].includes((profile.preferredFormat || "").toLowerCase());
        if (profile.extractAudio || item.mediaType === "audio" || legacyAudio) {
            if (item.mediaType === "image") {
                return { formatId: undefined, needsReview: true, reviewReason: `"${profile.name}" is audio-only but this link is an image` };
            }
            return { formatId: "audio", needsReview: false, reviewReason: "" };
        }

        // Images don't have "formats" in the traditional sense — a direct URL download works.
        if (item.mediaType === "image") {
            return { formatId: undefined, needsReview: false, reviewReason: "" };
        }

        // Derive effective resolution mode (backward compat: strictResolution bool → "strict")
        const mode = profile.resolutionMode || (profile.strictResolution ? "strict" : "flexible");

        // "best" means: pick the highest-quality available, no ceiling. Always matches.
        const maxResRaw = (profile.maxResolution || "best").toString();
        const isBest = maxResRaw === "best" || maxResRaw === "";
        const maxRes = isBest ? 0 : parseInt(maxResRaw.replace(/[^0-9]/g, ""), 10);
        const preferredExt = (profile.preferredFormat || "mp4").toLowerCase();

        // If no formats were extracted, we can only safely auto-start for the
        // "Best Quality" profile (no ceiling). For resolution-constrained profiles
        // we'd risk silently downloading the wrong quality — force manual review.
        if (formats.length === 0) {
            if (isBest) {
                return { formatId: undefined, needsReview: false, reviewReason: "" };
            }
            return {
                formatId: undefined,
                needsReview: true,
                reviewReason: `Couldn't read available formats for "${profile.name}" — pick one manually`,
            };
        }

        // Resolution predicate. Excludes audio-only formats (resolution = 0/null) from
        // video profiles — they would otherwise silently win the sort as resolution=0
        // passes every numeric comparison.
        const matchesRes = (f: typeof formats[number]) => {
            const resNum = f.resolution ? parseInt(f.resolution.replace(/[^0-9]/g, ""), 10) : 0;
            // Formats with no resolution are audio-only streams; skip them for video profiles.
            if (resNum === 0) return false;
            if (isBest) return true;
            if (!maxRes) return true;
            if (mode === "strict") return resNum === maxRes;
            if (mode === "minimum") return resNum >= maxRes;
            return resNum <= maxRes; // flexible (≤ ceiling)
        };

        // First pass: match by resolution AND preferred ext.
        const exactMatches = formats.filter((f) => {
            const extOk = preferredExt === "best" || !f.ext || f.ext.toLowerCase() === preferredExt;
            return matchesRes(f) && extOk;
        });
        if (exactMatches.length > 0) {
            const sorted = [...exactMatches].sort((a, b) => (parseInt(b.resolution || "0", 10) - parseInt(a.resolution || "0", 10)));
            return { formatId: sorted[0].formatId, needsReview: false, reviewReason: "" };
        }

        // Second pass: match by resolution only (ignore ext preference — server will remux).
        const resOnly = formats.filter(matchesRes);
        if (resOnly.length > 0) {
            const sorted = [...resOnly].sort((a, b) => (parseInt(b.resolution || "0", 10) - parseInt(a.resolution || "0", 10)));
            return { formatId: sorted[0].formatId, needsReview: false, reviewReason: "" };
        }

        // Nothing matches — user must pick manually.
        const videoFormats = formats.filter(f => f.resolution && parseInt(f.resolution.replace(/[^0-9]/g, ""), 10) > 0);
        // None of the formats carried a usable resolution (e.g. yt-dlp returned
        // only audio/storyboard streams). Don't print the 0p–9999p sentinels.
        if (videoFormats.length === 0) {
            return {
                formatId: undefined,
                needsReview: true,
                reviewReason: `Couldn't read available resolutions for "${profile.name}" — pick a format manually`,
            };
        }
        const maxAvailable = videoFormats.reduce((max, f) => Math.max(max, parseInt(f.resolution?.replace(/[^0-9]/g, "") || "0", 10)), 0);
        const minAvailable = videoFormats.reduce((min, f) => Math.min(min, parseInt(f.resolution?.replace(/[^0-9]/g, "") || "9999", 10)), 9999);
        return {
            formatId: undefined,
            needsReview: true,
            reviewReason: mode === "strict"
                ? `"${profile.name}" needs exactly ${maxResRaw}p but available: ${minAvailable}p–${maxAvailable}p`
                : mode === "minimum"
                    ? `"${profile.name}" wants ≥${maxResRaw}p but best available is ${maxAvailable}p`
                    : `"${profile.name}" wants ≤${maxResRaw}p but lowest available is ${minAvailable}p`,
        };
    }, []);

    const applyQueueProfileToItem = useCallback((item: QueueItem): QueueItem => {
        if (item.status === "downloading" || item.status === "completed" || item.status === "error" || item.status === "cancelled") {
            return item;
        }
        const profile = selectedQueueProfile === "default-auto"
            ? matchProfileForUrl(item.originalUrl)
            : profiles.find((p) => p.id === selectedQueueProfile);
        if (!profile) {
            return { ...item, needsReview: true, reviewReason: "No profile available", matchedProfileName: undefined };
        }
        if (profile.requireManualFormat) {
            return {
                ...item,
                matchedProfileName: profile.name,
                needsReview: !item.selectedFormat,
                reviewReason: !item.selectedFormat ? `"${profile.name}" requires manual format selection` : undefined,
            };
        }
        const picked = pickFormatForProfile(item, profile);
        const effectiveMode = profile.resolutionMode || (profile.strictResolution ? "strict" : "flexible");
        const resOp = effectiveMode === "strict" ? "=" : effectiveMode === "minimum" ? "≥" : "≤";
        const matchedLabel = picked.formatId === "audio"
            ? `Audio (${(profile.audioFormat || (["mp3", "m4a", "wav"].includes((profile.preferredFormat || "").toLowerCase()) ? profile.preferredFormat : "mp3") || "mp3").toUpperCase()})`
            : picked.formatId && item.formats
                ? (item.formats.find(f => f.formatId === picked.formatId)?.label ?? "Auto")
                : profile.maxResolution === "best"
                    ? "Best available"
                    : `${resOp}${profile.maxResolution}p ${(profile.preferredFormat || "mp4").toUpperCase()}`;
        return {
            ...item,
            selectedFormat: picked.formatId ?? item.selectedFormat ?? "",
            needsReview: picked.needsReview,
            reviewReason: picked.reviewReason || undefined,
            matchedProfileName: profile.name,
            matchedFormatLabel: picked.needsReview ? undefined : matchedLabel,
        };
    }, [matchProfileForUrl, pickFormatForProfile, profiles, selectedQueueProfile]);

    /** Toast and refresh the library the first time a job is seen finished. */
    const announceCompletion = useCallback((jobId: string, kind?: string) => {
        if (!jobId || announcedCompletionsRef.current.has(jobId)) return;
        announcedCompletionsRef.current.add(jobId);
        toast.success(kind === "export" ? "Export complete!" : "Download complete!");
        refreshLibrary();
    }, [refreshLibrary]);

    const fetchQueue = async () => {
        try {
            const res = await fetch("/api/download/queue");
            if (res.ok) {
                const jobs = await res.json();
                const activeJobs: QueueItem[] = (Array.isArray(jobs) ? jobs : []).map((j: any) => ({
                    id: j.id,
                    jobId: j.id,
                    kind: j.kind === "export" ? "export" : "download",
                    originalUrl: j.url,
                    title: j.title,
                    status: j.status,
                    progress: j.progress,
                    thumbnail: j.thumbnailUrl || j.imageUrl,
                    sourcePlatform: j.sourcePlatform,
                    duration: j.duration,
                    errorText: j.error,
                    mediaType: j.mediaType,
                    imageUrl: j.imageUrl,
                    matchedProfileName: j.profileName,
                    matchedFormatLabel: j.formatLabel,
                    downloadPath: j.downloadPath,
                }));

                // Jobs already finished when the app opened are not news — seed
                // them so a restart doesn't replay every past completion.
                if (!completionsSeededRef.current) {
                    for (const job of activeJobs) {
                        if (job.status === "completed") announcedCompletionsRef.current.add(job.jobId as string);
                    }
                    completionsSeededRef.current = true;
                } else {
                    for (const job of activeJobs) {
                        if (job.status === "completed") {
                            announceCompletion(job.jobId as string, job.kind);
                        }
                    }
                }

                setQueue(prev => {
                    const localOnly = prev.filter(p => !p.jobId && (p.status === 'parsing' || p.status === 'pending'));
                    if (activeJobs.length === 0) return localOnly;
                    const prevById = new Map(prev.filter(p => p.jobId).map(p => [p.jobId as string, p]));
                    const merged = activeJobs.map(job => {
                        const existing = prevById.get(job.jobId as string);
                        if (!existing) return job;
                        return {
                            ...existing,
                            ...job,
                            id: existing.id,
                            thumbnail: existing.thumbnail || job.thumbnail,
                            title: job.title || existing.title,
                            sourcePlatform: existing.sourcePlatform || job.sourcePlatform,
                            duration: existing.duration || job.duration,
                            formats: existing.formats,
                            selectedFormat: existing.selectedFormat,
                            mediaType: existing.mediaType || job.mediaType,
                            imageUrl: existing.imageUrl || job.imageUrl,
                            matchedProfileName: existing.matchedProfileName || job.matchedProfileName,
                            matchedFormatLabel: existing.matchedFormatLabel || job.matchedFormatLabel,
                            downloadPath: job.downloadPath || existing.downloadPath,
                            progress: (job.status === "downloading" || job.status === "processing" || job.status === "paused")
                                ? Math.max(existing.progress || 0, job.progress || 0)
                                : (job.progress ?? existing.progress),
                            errorText: (job.status === "error" || job.status === "cancelled")
                                ? (job.errorText || existing.errorText)
                                : undefined,
                        } satisfies QueueItem;
                    });
                    return [...localOnly, ...merged];
                });

                activeJobs.forEach(q => {
                    if (q.status !== 'completed' && q.status !== 'error' && q.status !== 'cancelled' && q.jobId) {
                        pollProgress(q.id, q.jobId);
                    }
                });
            }
        } catch (error) {
            console.error("Failed to restore queue", error);
        }
    };

    // `overrideText` lets a caller (e.g. the ?url= bookmarklet handoff) add a
    // link without going through the textarea's state first — setUrlText()
    // wouldn't be visible to this function until the next render.
    const handleAddLinks = (overrideText?: string) => {
        const links = [...new Set((overrideText ?? urlText).split('\n').map(l => l.trim()).filter(l => l.length > 0))];
        if (links.length === 0) return;

        // Only block links that are CURRENTLY active in the queue (parsing/pending/downloading/etc).
        // Completed/cancelled queue items AND library items are allowed back in — user may want
        // to re-download with a different format/profile.
        const activeInQueue = new Set(
            queue
                .filter(q => !["completed", "error", "cancelled"].includes(q.status))
                .map(q => q.originalUrl)
        );

        let skippedCount = 0;
        const newItems: QueueItem[] = [];
        for (const url of links) {
            if (activeInQueue.has(url)) {
                skippedCount++;
                continue;
            }
            newItems.push({
                id: Math.random().toString(36).substring(7),
                originalUrl: url,
                status: 'parsing',
            });
        }

        if (skippedCount > 0) {
            toast.info(`Skipped ${skippedCount} link${skippedCount > 1 ? "s" : ""} — already being processed`);
        }
        if (newItems.length === 0) {
            setUrlText("");
            return;
        }

        setQueue(prev => [...newItems, ...prev]);
        setUrlText("");

        newItems.forEach(item => parseLink(item.id, item.originalUrl));
    };

    const parseLink = async (id: string, url: string) => {
        try {
            // 1. Parse Metadata
            const metadata = await api.post<any>("/api/download/preview", { url });

            // Check if this is a playlist
            if (metadata.isPlaylist && metadata.items?.length > 1) {
                toast.success(`📋 Playlist detected: "${metadata.playlistTitle}" (${metadata.items.length} items)`);

                // Remove the original parsing item
                setQueue(prev => prev.filter(q => q.id !== id));

                // Add individual items
                const playlistItems: QueueItem[] = metadata.items.map((item: any) => ({
                    id: Math.random().toString(36).substring(7),
                    originalUrl: item.url,
                    title: item.title,
                    thumbnail: item.thumbnail,
                    duration: item.duration,
                    status: 'parsing' as const,
                }));

                setQueue(prev => [...playlistItems, ...prev]);

                // Start parsing each item
                for (const item of playlistItems) {
                    parseLink(item.id, item.originalUrl);
                }
                return;
            }

            // Compute the matched item synchronously (applyQueueProfileToItem is
            // pure), so the auto-start decision never depends on the setQueue
            // updater having run yet. The old code read a variable set *inside*
            // the updater, which runs asynchronously — so for playlists some
            // cleanly-matched items silently stayed "pending" (the 2-of-3 bug).
            const updated = applyQueueProfileToItem({
                id,
                originalUrl: url,
                title: metadata.title,
                thumbnail: metadata.thumbnail,
                sourcePlatform: metadata.sourcePlatform,
                duration: metadata.duration ?? undefined,
                mediaType: metadata.mediaType || "video",
                imageUrl: metadata.imageUrl,
                formats: metadata.formats || [],
                selectedFormat: "",
                status: 'pending',
            });
            setQueue(prev => prev.map(q => q.id === id ? { ...q, ...updated } : q));

            // Auto-start download when profile matches cleanly — no manual click required.
            if (!updated.needsReview) {
                const label = updated.matchedFormatLabel ? ` · ${updated.matchedFormatLabel}` : "";
                toast.success(`Auto-downloading "${updated.title?.slice(0, 40)}${(updated.title?.length || 0) > 40 ? "…" : ""}" with ${updated.matchedProfileName || "default"}${label}`);
                setTimeout(() => startDownloadJobForItem(updated), 0);
            }

        } catch (error: any) {
            setQueue(prev => prev.map(q => q.id === id ? {
                ...q,
                status: 'error',
                errorText: error.message
            } : q));
        }
    };

    const startDownloadJobForItem = async (item: QueueItem) => {
        const id = item.id;
        if (retryingQueueIds.has(id)) return;
        if (item.needsReview && !item.selectedFormat) {
            toast.error(item.reviewReason || "This item needs format review before download");
            return;
        }

        const selectedProfile = selectedQueueProfile === "default-auto" ? undefined : selectedQueueProfile;

        try {
            setRetryingQueueIds((prev) => new Set(prev).add(id));
            setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'pending' as const, errorText: undefined } : q));

            const dlData = await api.post<{ jobId: string }>("/api/download", {
                url: item.originalUrl,
                title: item.title,
                sourcePlatform: item.sourcePlatform,
                mediaType: item.mediaType || "video",
                imageUrl: item.imageUrl,
                thumbnail: item.thumbnail,
                formatId: item.selectedFormat || undefined,
                profileId: selectedProfile,
                retryJobId: item.jobId || undefined,
                duration: item.duration,
                profileName: item.matchedProfileName,
                formatLabel: item.matchedFormatLabel,
            });

            setQueue(prev => prev.map(q => q.id === id ? {
                ...q,
                jobId: dlData.jobId,
                status: 'downloading',
                progress: 0
            } : q));

            pollProgress(id, dlData.jobId);
        } catch (error: any) {
            setQueue(prev => prev.map(q => q.id === id ? {
                ...q,
                status: 'error',
                errorText: error.message
            } : q));
        } finally {
            setRetryingQueueIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const startDownloadJob = (id: string) => {
        const item = queue.find(q => q.id === id);
        if (!item) return;
        return startDownloadJobForItem(item);
    };

    // Retry a failed/cancelled export by replaying its stored request server-side.
    const retryExportJob = async (item: QueueItem) => {
        if (!item.jobId || retryingQueueIds.has(item.id)) return;
        try {
            setRetryingQueueIds((prev) => new Set(prev).add(item.id));
            setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "processing", progress: 0, errorText: undefined } : q));
            await api.post("/api/library/edit", { action: "retry-export", jobId: item.jobId });
        } catch (error: any) {
            setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error", errorText: error.message } : q));
            toast.error(error.message || "Failed to retry export");
        } finally {
            setRetryingQueueIds((prev) => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });
        }
    };

    // SSE-based progress: single connection streams all active job progress
    const setupSSE = useCallback(() => {
        if (sseRef.current) return;
        const es = new EventSource("/api/download/events");
        sseRef.current = es;

        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data._heartbeat || data._connected) return;

                setQueue(prev => {
                    let changed = false;
                    const next = prev.map(q => {
                        if (!q.jobId || !data[q.jobId]) return q;
                        const live = data[q.jobId];
                        if (live.status === q.status && Math.abs((live.progress || 0) - (q.progress || 0)) < 0.5) return q;
                        changed = true;
                        const updated = { ...q };
                        updated.status = live.status;
                        updated.progress = live.progress ?? q.progress;
                        if (live.status === "error" || live.status === "cancelled") {
                            updated.errorText = live.error || q.errorText;
                        } else {
                            updated.errorText = undefined;
                        }
                        return updated;
                    });
                    return changed ? next : prev;
                });

                // Completion is announced from the incoming payload rather than
                // from a local state change, so a job that finishes before the
                // UI ever shows it running still refreshes the library.
                for (const [jobId, live] of Object.entries(data as Record<string, { status?: string; kind?: string }>)) {
                    if (live?.status === "completed") announceCompletion(jobId, live.kind);
                }
            } catch { /* ignore parse errors */ }
        };

        es.onerror = () => {
            es.close();
            sseRef.current = null;
            // Reconnect after 3s
            setTimeout(() => setupSSE(), 3000);
        };
    }, [announceCompletion]);

    // Legacy per-job polling as fallback for when SSE is not yet connected
    const pollProgress = (itemId: string, jobId: string) => {
        if (pollingRefs.current[jobId]) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/download/${jobId}`);
                const data = await res.json();

                if (data.status === "completed") {
                    clearInterval(interval);
                    delete pollingRefs.current[jobId];
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: 'completed',
                        progress: 100
                    } : q));
                    toast.success("Download complete!");
                    refreshLibrary();
                } else if (data.status === "error") {
                    clearInterval(interval);
                    delete pollingRefs.current[jobId];
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: 'error',
                        errorText: data.error || "Download failed"
                    } : q));
                } else if (data.status === "paused") {
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: 'paused',
                        progress: data.progress || q.progress || 0,
                    } : q));
                } else if (data.status === "cancelled") {
                    clearInterval(interval);
                    delete pollingRefs.current[jobId];
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: 'cancelled',
                        errorText: data.error || "Cancelled by user",
                    } : q));
                } else {
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: (data.status || q.status),
                        progress: data.progress || 0
                    } : q));
                }
            } catch {
                // ignore network glitches
            }
        }, 1000);
        pollingRefs.current[jobId] = interval;
    };

    useEffect(() => {
        const init = async () => {
            fetchQueue();
            // Resume any interrupted jobs from a previous server session
            fetch("/api/download/queue", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resumeInterrupted" }),
            }).catch(() => {});
            fetch("/api/profiles")
                .then((r) => r.json())
                .then((data) => {
                    if (Array.isArray(data)) setProfiles(data);
                })
                .catch(() => {});
        };
        init();

        // SSE for real-time progress
        setupSSE();

        // Global queue sync for Chrome Extension interactions (less frequent now with SSE)
        const globalPoll = setInterval(fetchQueue, 5000);

        const polling = pollingRefs.current;
        return () => {
            clearInterval(globalPoll);
            Object.values(polling).forEach(clearInterval);
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        setQueue((prev) => prev.map((item) => applyQueueProfileToItem(item)));
    }, [selectedQueueProfile, applyQueueProfileToItem]);

    // WID-300: Bookmarklet Auto-Ingestion
    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const urlToParse = searchParams.get('url');

        if (urlToParse) {
            const newItem: QueueItem = {
                id: Math.random().toString(36).substring(7),
                originalUrl: urlToParse,
                status: 'parsing'
            };

            setQueue(prev => [newItem, ...prev]);

            // Wait a tick for queue state to settle, then call parse
            setTimeout(() => {
                parseLink(newItem.id, newItem.originalUrl);
            }, 50);

            // Clean up the URL to prevent double ingestion on refresh
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredQueue = useMemo(() => {
        if (queueFilter === "all") return queue;
        if (queueFilter === "active") {
            return queue.filter((q) => ["parsing", "pending", "queued", "downloading", "processing", "paused"].includes(q.status));
        }
        return queue.filter((q) => q.status === "error" || q.status === "cancelled" || (q.status === "completed" && !!q.errorText));
    }, [queue, queueFilter]);

    return {
        urlText, setUrlText,
        queue, setQueue,
        profiles,
        selectedQueueProfile, setSelectedQueueProfile,
        queueFilter, setQueueFilter,
        retryingQueueIds,
        filteredQueue,
        fetchQueue,
        handleAddLinks,
        parseLink,
        startDownloadJob,
        retryExportJob,
    };
}
