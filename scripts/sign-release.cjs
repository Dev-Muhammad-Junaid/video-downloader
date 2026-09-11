#!/usr/bin/env node
/**
 * Signs a built .dmg with the project's Ed25519 release key.
 *
 * WHY THIS EXISTS
 *
 * The app is not code-signed by Apple (no Developer ID yet), so macOS provides
 * no guarantee that an update the app downloads is genuinely ours. A SHA-512
 * alone doesn't fix that: the hash is published in the same GitHub release as
 * the file, so anyone able to alter one can alter the other.
 *
 * A signature made with a key that lives OUTSIDE the repository does fix it.
 * Compromising the GitHub account is then not enough to ship a malicious
 * update — the attacker would also need the private key, which is only ever on
 * the maintainer's machine at ~/.snapdown/release-signing-key.pem (0600) and
 * is never committed, uploaded or printed.
 *
 * The matching public key is embedded in the app, so the updater can verify
 * before it replaces anything.
 *
 * Usage: node scripts/sign-release.cjs dist/SnapDown-0.3.5-arm64.dmg
 */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const KEY_PATH = path.join(os.homedir(), ".snapdown", "release-signing-key.pem");

function main() {
    const dmgPath = process.argv[2];
    if (!dmgPath) {
        console.error("usage: node scripts/sign-release.cjs <path-to-dmg>");
        process.exit(1);
    }
    if (!fs.existsSync(dmgPath)) {
        console.error(`error: ${dmgPath} not found`);
        process.exit(1);
    }
    if (!fs.existsSync(KEY_PATH)) {
        console.error(
            `error: no release signing key at ${KEY_PATH}\n` +
            `This machine can't publish releases. Generate a key with:\n` +
            `  node -e "const{generateKeyPairSync}=require('crypto'),fs=require('fs'),os=require('os'),p=require('path');` +
            `const d=p.join(os.homedir(),'.snapdown');fs.mkdirSync(d,{recursive:true,mode:0o700});` +
            `const{publicKey,privateKey}=generateKeyPairSync('ed25519');` +
            `fs.writeFileSync(p.join(d,'release-signing-key.pem'),privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});` +
            `fs.writeFileSync(p.join(d,'release-signing-key.pub'),publicKey.export({type:'spki',format:'pem'}))"\n` +
            `...then put the new public key in src/lib/update-key.ts — note that doing so\n` +
            `invalidates every signature made with the old key.`,
        );
        process.exit(1);
    }

    const privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_PATH, "utf-8"));

    // Sign the file's SHA-512 rather than streaming the whole 180MB through
    // the signer: same guarantee, and it matches the digest electron-builder
    // already records in latest-mac.yml so the two can be cross-checked.
    const digest = crypto.createHash("sha512").update(fs.readFileSync(dmgPath)).digest();
    const signature = crypto.sign(null, digest, privateKey); // Ed25519 takes no separate hash

    const sigPath = `${dmgPath}.sig`;
    fs.writeFileSync(sigPath, signature.toString("base64") + "\n", "utf-8");

    console.log(`signed ${path.basename(dmgPath)}`);
    console.log(`  sha512:    ${digest.toString("base64")}`);
    console.log(`  signature: ${sigPath}`);
}

main();
