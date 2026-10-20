import { TikTokApiError, refreshAccessToken } from "./api";
import type { TikTokCredentials } from "./config";
import {
	type StoredTikTokAccount,
	deleteTikTokAccount,
	readTikTokAccount,
	writeTikTokAccount,
} from "./token-store";

/** Refresh a little early so an upload never starts with a token about to expire. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

let refreshInFlight: Promise<StoredTikTokAccount> | null = null;

function notConnected(): TikTokApiError {
	return new TikTokApiError(
		"No TikTok account connected",
		"access_token_invalid",
		401,
	);
}

/**
 * The stored account with an access token good for at least a few minutes.
 * The refresh token may rotate, so concurrent callers share one refresh.
 */
export async function getFreshTikTokAccount(
	credentials: TikTokCredentials,
): Promise<StoredTikTokAccount> {
	const account = await readTikTokAccount({
		clientSecret: credentials.clientSecret,
	});
	if (!account) throw notConnected();
	if (account.accessTokenExpiresAt - REFRESH_MARGIN_MS > Date.now()) {
		return account;
	}
	if (account.refreshTokenExpiresAt <= Date.now()) {
		await deleteTikTokAccount();
		throw notConnected();
	}

	refreshInFlight ??= (async () => {
		try {
			const refreshed = await refreshAccessToken({
				credentials,
				refreshToken: account.refreshToken,
			});
			const next: StoredTikTokAccount = {
				...refreshed,
				displayName: account.displayName,
				avatarUrl: account.avatarUrl,
			};
			await writeTikTokAccount({
				account: next,
				clientSecret: credentials.clientSecret,
			});
			return next;
		} catch (error) {
			if (error instanceof TikTokApiError && error.code === "invalid_grant") {
				await deleteTikTokAccount();
				throw notConnected();
			}
			throw error;
		} finally {
			refreshInFlight = null;
		}
	})();
	return refreshInFlight;
}
