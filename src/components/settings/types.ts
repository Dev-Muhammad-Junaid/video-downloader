import React from "react";

/** Shape of the settings form state on the Settings page. */
export interface SettingsState {
    s3Endpoint: string;
    s3Bucket: string;
    s3AccessKey: string;
    s3SecretKey: string;
    s3Region: string;
    storageLimit: number;
    watchFolder: string;
    destinationFolder: string;
    urlExpiry: number;
    transcriptionProvider: "openai" | "groq";
    openaiApiKey: string;
    groqApiKey: string;
    whisperLanguage: string;
    ytCookiesBrowser: string;
}

export type SetSettings = React.Dispatch<React.SetStateAction<SettingsState>>;
