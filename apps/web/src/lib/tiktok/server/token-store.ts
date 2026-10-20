import {
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes,
} from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The connected TikTok account lives on the server only, in one file next to
 * the launcher's state (%LOCALAPPDATA%\OpenCut-AI on Windows). The file is
 * encrypted with a key derived from TIKTOK_CLIENT_SECRET, so a copied file is
 * useless without the secret, and changing the secret disconnects the account.
 */

export interface StoredTikTokAccount {
	openId: string;
	accessToken: string;
	refreshToken: string;
	scope: string;
	/** Epoch ms. */
	accessTokenExpiresAt: number;
	/** Epoch ms. */
	refreshTokenExpiresAt: number;
	displayName?: string;
	avatarUrl?: string;
}

interface EncryptedFile {
	v: 1;
	iv: string;
	tag: string;
	data: string;
}

function getDataDir(): string {
	const configured = process.env.OPENCUT_DATA_DIR?.trim();
	if (configured) return configured;
	if (process.env.LOCALAPPDATA) {
		return join(process.env.LOCALAPPDATA, "OpenCut-AI");
	}
	return join(homedir(), ".opencut-ai");
}

export function getTikTokAccountFilePath(): string {
	return join(getDataDir(), "tiktok-account.json");
}

function deriveKey(clientSecret: string): Buffer {
	return Buffer.from(
		hkdfSync("sha256", clientSecret, "opencut-ai", "tiktok-account-v1", 32),
	);
}

export async function readTikTokAccount({
	clientSecret,
}: {
	clientSecret: string;
}): Promise<StoredTikTokAccount | null> {
	let raw: string;
	try {
		raw = await readFile(getTikTokAccountFilePath(), "utf8");
	} catch {
		return null;
	}
	try {
		const file = JSON.parse(raw) as EncryptedFile;
		if (file.v !== 1) return null;
		const decipher = createDecipheriv(
			"aes-256-gcm",
			deriveKey(clientSecret),
			Buffer.from(file.iv, "base64"),
		);
		decipher.setAuthTag(Buffer.from(file.tag, "base64"));
		const plain = Buffer.concat([
			decipher.update(Buffer.from(file.data, "base64")),
			decipher.final(),
		]).toString("utf8");
		return JSON.parse(plain) as StoredTikTokAccount;
	} catch {
		// Other secret or damaged file: same as not connected.
		return null;
	}
}

export async function writeTikTokAccount({
	account,
	clientSecret,
}: {
	account: StoredTikTokAccount;
	clientSecret: string;
}): Promise<void> {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", deriveKey(clientSecret), iv);
	const data = Buffer.concat([
		cipher.update(JSON.stringify(account), "utf8"),
		cipher.final(),
	]);
	const file: EncryptedFile = {
		v: 1,
		iv: iv.toString("base64"),
		tag: cipher.getAuthTag().toString("base64"),
		data: data.toString("base64"),
	};
	const path = getTikTokAccountFilePath();
	await mkdir(dirname(path), { recursive: true });
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await writeFile(temporaryPath, JSON.stringify(file), { mode: 0o600 });
	await rename(temporaryPath, path);
}

export async function deleteTikTokAccount(): Promise<void> {
	await rm(getTikTokAccountFilePath(), { force: true });
}
