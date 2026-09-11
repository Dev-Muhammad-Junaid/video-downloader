import { describe, it, expect } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { verifySignature, RELEASE_PUBLIC_KEY } = require(
    path.resolve(process.cwd(), "electron/updater.cjs"),
);

/**
 * The updater downloads an executable and replaces the app with it. Without an
 * Apple Developer ID there is no OS-level guarantee the download is ours, so
 * this signature check is the ONLY thing standing between a tampered release
 * and arbitrary code execution. It gets tested accordingly.
 */
const sign = (buf: Buffer, privateKey: crypto.KeyObject) =>
    crypto.sign(null, crypto.createHash("sha512").update(buf).digest(), privateKey).toString("base64");

describe("update signature verification", () => {
    it("accepts a build signed with the real release key", () => {
        // Signed with the actual private key on this machine, so this also
        // proves the embedded public key matches the one releases are signed
        // with — a mismatch there would break every update silently.
        const keyPath = path.join(process.env.HOME!, ".snapdown", "release-signing-key.pem");
        if (!fs.existsSync(keyPath)) return; // not the maintainer's machine
        const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath, "utf-8"));

        const payload = Buffer.from("pretend dmg contents");
        expect(() => verifySignature(payload, sign(payload, privateKey))).not.toThrow();
    });

    it("rejects a payload modified after signing", () => {
        const { privateKey } = crypto.generateKeyPairSync("ed25519");
        const original = Buffer.from("the real installer");
        const signature = sign(original, privateKey);
        // Even with a valid-looking signature, altered bytes must fail.
        expect(() => verifySignature(Buffer.from("a malicious installer"), signature)).toThrow(/signature check/i);
    });

    it("rejects a build signed with some other key", () => {
        // The whole point: compromising GitHub is not enough, because the
        // attacker cannot produce a signature under OUR key.
        const { privateKey: attackerKey } = crypto.generateKeyPairSync("ed25519");
        const payload = Buffer.from("attacker's installer");
        expect(() => verifySignature(payload, sign(payload, attackerKey))).toThrow(/signature check/i);
    });

    it("rejects garbage and empty signatures rather than passing them through", () => {
        const payload = Buffer.from("anything");
        expect(() => verifySignature(payload, "")).toThrow();
        expect(() => verifySignature(payload, "not-base64-at-all!!")).toThrow();
        expect(() => verifySignature(payload, Buffer.alloc(64).toString("base64"))).toThrow();
    });

    it("says plainly that nothing was installed when verification fails", () => {
        const { privateKey } = crypto.generateKeyPairSync("ed25519");
        const payload = Buffer.from("x");
        expect(() => verifySignature(payload, sign(payload, privateKey)))
            .toThrow(/NOT installed|Nothing on your Mac was changed/i);
    });

    it("embeds a real Ed25519 public key", () => {
        const key = crypto.createPublicKey(RELEASE_PUBLIC_KEY);
        expect(key.asymmetricKeyType).toBe("ed25519");
    });
});
