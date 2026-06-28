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
