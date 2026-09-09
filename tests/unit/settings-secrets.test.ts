import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The properties that matter for secret storage:
 *   - secrets resolve from the Keychain, not the plaintext file
 *   - the environment still wins over both, and is never persisted
 *   - a failed Keychain write must NOT silently fall back to plaintext
 *   - migration only scrubs the file after the Keychain write is confirmed
 */
const mockFs = vi.hoisted(() => ({
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => "{}"),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
}));
const mockKc = vi.hoisted(() => ({
    isKeychainAvailable: vi.fn(() => true),
    readSecret: vi.fn((_account: string): string | undefined => undefined),
    writeSecret: vi.fn((_account: string, _value: string): boolean => true),
    deleteSecret: vi.fn((_account: string): void => undefined),
}));

vi.mock("fs", () => ({ default: mockFs, ...mockFs }));
vi.mock("@/lib/app-paths", () => ({ appDataPath: () => "/tmp/.server_settings.json" }));
vi.mock("@/lib/secrets", () => mockKc);

const written = () => {
    const call = mockFs.writeFileSync.mock.calls.at(-1);
    return call ? JSON.parse(call[1] as string) : null;
};

async function fresh() {
    vi.resetModules();
    return import("@/lib/settings");
}

describe("secret storage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockKc.isKeychainAvailable.mockReturnValue(true);
        mockKc.writeSecret.mockReturnValue(true);
        mockKc.readSecret.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue("{}");
        delete process.env.SNAPDOWN_GROQ_API_KEY;
    });
    afterEach(() => { delete process.env.SNAPDOWN_GROQ_API_KEY; });

    it("reads a secret from the Keychain rather than the file", async () => {
        mockKc.readSecret.mockImplementation((k: string) => (k === "groqApiKey" ? "kc-key" : undefined));
        const { getServerSettings } = await fresh();
        expect(getServerSettings().groqApiKey).toBe("kc-key");
    });

    it("stores R2 credentials whole, so the endpoint's account id is protected too", async () => {
        const creds = { s3Endpoint: "https://acct.r2.com", s3Bucket: "b", s3Region: "auto", s3AccessKey: "ak", s3SecretKey: "sk" };
        mockKc.readSecret.mockImplementation((k: string) => (k === "r2_credentials" ? JSON.stringify(creds) : undefined));
        const { getServerSettings } = await fresh();
        expect(getServerSettings().r2_credentials).toEqual(creds);
    });

    it("writes a secret to the Keychain and never into the file", async () => {
        const { updateServerSetting } = await fresh();
        updateServerSetting("groqApiKey", "brand-new");
        expect(mockKc.writeSecret).toHaveBeenCalledWith("groqApiKey", "brand-new");
        for (const call of mockFs.writeFileSync.mock.calls) {
            expect(call[1] as string).not.toContain("brand-new");
        }
    });

    it("does NOT fall back to plaintext when the Keychain write fails", async () => {
        mockKc.writeSecret.mockReturnValue(false);
        const { updateServerSetting } = await fresh();
        updateServerSetting("groqApiKey", "should-not-persist");
        for (const call of mockFs.writeFileSync.mock.calls) {
            expect(call[1] as string).not.toContain("should-not-persist");
        }
    });

    it("migrates a file secret into the Keychain and scrubs it from the file", async () => {
        mockFs.readFileSync.mockReturnValue(JSON.stringify({ groqApiKey: "legacy", ytCookiesBrowser: "chrome" }));
        const { getServerSettings } = await fresh();
        getServerSettings();

        expect(mockKc.writeSecret).toHaveBeenCalledWith("groqApiKey", "legacy");
        const file = written();
        expect(file).not.toHaveProperty("groqApiKey");
        expect(file.ytCookiesBrowser).toBe("chrome"); // non-secrets survive
    });

    it("keeps the file secret if the Keychain write fails during migration", async () => {
        mockFs.readFileSync.mockReturnValue(JSON.stringify({ groqApiKey: "legacy" }));
        mockKc.writeSecret.mockReturnValue(false);
        const { getServerSettings } = await fresh();
        expect(getServerSettings().groqApiKey).toBe("legacy");
        expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it("lets the environment win over the Keychain, and refuses to persist it", async () => {
        mockKc.readSecret.mockImplementation((k: string) => (k === "groqApiKey" ? "kc-key" : undefined));
        process.env.SNAPDOWN_GROQ_API_KEY = "env-key";
        const { getServerSettings, updateServerSetting } = await fresh();

        expect(getServerSettings().groqApiKey).toBe("env-key");
        updateServerSetting("groqApiKey", "typed-in-ui");
        expect(mockKc.writeSecret).not.toHaveBeenCalledWith("groqApiKey", "typed-in-ui");
    });

    it("clearing a secret deletes the Keychain item", async () => {
        const { updateServerSetting } = await fresh();
        updateServerSetting("groqApiKey", "");
        expect(mockKc.deleteSecret).toHaveBeenCalledWith("groqApiKey");
    });

    it("falls back to the file on platforms without a Keychain", async () => {
        mockKc.isKeychainAvailable.mockReturnValue(false);
        mockKc.readSecret.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({ groqApiKey: "file-key" }));
        const { getServerSettings, updateServerSetting } = await fresh();

        expect(getServerSettings().groqApiKey).toBe("file-key");
        updateServerSetting("groqApiKey", "new-key");
        expect(written().groqApiKey).toBe("new-key");
    });

    it("writes the settings file 0600", async () => {
        const { updateServerSetting } = await fresh();
        updateServerSetting("ytCookiesBrowser", "safari");
        const opts = mockFs.writeFileSync.mock.calls.at(-1)![2] as { mode: number };
        expect(opts.mode).toBe(0o600);
        expect(mockFs.chmodSync).toHaveBeenCalledWith("/tmp/.server_settings.json", 0o600);
    });
});
