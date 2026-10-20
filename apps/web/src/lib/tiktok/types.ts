/** Shapes shared by the /api/tiktok routes and the export popover. */

export type TikTokPublishStatus =
	| "PROCESSING_UPLOAD"
	| "PROCESSING_DOWNLOAD"
	| "SEND_TO_USER_INBOX"
	| "PUBLISH_COMPLETE"
	| "FAILED";

export interface TikTokAccountResponse {
	/** TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are set on the server. */
	configured: boolean;
	connected: boolean;
	displayName?: string;
	avatarUrl?: string;
}

export interface TikTokUploadInitResponse {
	publishId: string;
	chunkSize: number;
	totalChunkCount: number;
}

export interface TikTokChunkResponse {
	/** All bytes received; TikTok starts processing. */
	complete: boolean;
}

export interface TikTokPublishStatusResponse {
	status: TikTokPublishStatus;
	failReason?: string;
	message?: string;
}

export interface TikTokErrorResponse {
	error: string;
	/** TikTok's error code, when the failure came from TikTok. */
	code?: string;
	/** The account must be connected (again) before retrying. */
	reconnect?: boolean;
	/** Same request may succeed if sent again. */
	retryable?: boolean;
}
