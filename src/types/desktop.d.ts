/** The bridge exposed by electron/preload.cjs. Undefined in the browser. */
export interface SnapDownDesktop {
    isDesktop: true;
    update: {
        download: () => Promise<{ version: string }>;
        restart: () => Promise<{ version: string }>;
        onProgress: (cb: (p: { received: number; total: number }) => void) => () => void;
        onStatus: (cb: (s: { phase: string; version?: string; size?: number }) => void) => () => void;
    };
}

declare global {
    interface Window {
        snapdown?: SnapDownDesktop;
    }
}

export {};
