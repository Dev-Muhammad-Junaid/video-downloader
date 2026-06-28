// Shared domain types. Import these instead of redefining per-component.

import type { Subtitle } from "@/components/video-editor/subtitle-types";
import type { SubtitleStyleConfig } from "@/lib/ass-builder";

export type { Subtitle, SubtitleStyleConfig };

/** A library media item (video, audio, or image). Superset used across the app. */
export type Video = {
    id: string;
    title: string;
    duration: number | null;
    sourcePlatform: string | null;
    localPath: string;
    fileSize: number | null;
    mediaType?: string | null;
    originalUrl?: string | null;
    createdAt: string;
    labels?: { id: string; name: string; color: string | null }[];
    cloudKey?: string | null;
    cloudUrl?: string | null;
    cloudUploadedAt?: string | null;
    thumbnailPath?: string | null;
    // Transcription
    transcriptStatus?: string | null;
    transcriptText?: string | null;
    transcriptPath?: string | null;
    // Search snippet (populated in deep-search mode)
    transcriptSnippet?: string | null;
    matchedIn?: string[];
};

/** A single available download/transcode format for a queued link. */
export type QueueFormat = {
    formatId: string;
    label: string;
    ext: string;
    resolution: string | null;
    filesize: number | null;
    note: string;
};

/** An item in the download/export queue (local optimistic state + server job). */
export type QueueItem = {
    id: string; // temp id
    originalUrl: string;
    title?: string;
    thumbnail?: string;
    sourcePlatform?: string;
    duration?: number;
    status: 'parsing' | 'pending' | 'queued' | 'downloading' | 'processing' | 'paused' | 'completed' | 'error' | 'cancelled';
    kind?: 'download' | 'export';
    jobId?: string;
    progress?: number;
    errorText?: string;
    mediaType?: string;
    imageUrl?: string;
    formats?: QueueFormat[];
    selectedFormat?: string;
    needsReview?: boolean;
    reviewReason?: string;
    matchedProfileName?: string;
    matchedFormatLabel?: string;
    /** Output file path for a finished export — used to link the queue row back
     *  to its resulting library item (exports have no originalUrl). */
    downloadPath?: string;
};

/** A download profile (format/resolution rules matched against URLs). */
export type DownloadProfile = {
    id: string;
    name: string;
    sitePattern: string | null;
    maxResolution: string | null;
    preferredFormat: string | null;
    preferredImageFormat: string | null;
    audioFormat?: string | null;
    audioBitrate?: string | null;
    extractAudio?: boolean;
    priority: number;
    isActive: boolean;
    requireManualFormat?: boolean;
    strictResolution?: boolean;
    resolutionMode?: string | null; // "flexible" | "strict" | "minimum"
};
