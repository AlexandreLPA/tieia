import type { AIActiveLLM } from "@/types/ai";

export interface MemoryStatus {
	allocated: number;
	reserved: number;
	total: number;
}

export interface ServiceInfo {
	status: string;
	version?: string;
	port?: number;
	url?: string;
	models?: { name: string; size: number; modified_at: string }[];
	default_model?: string;
	model_size?: string;
	device?: string;
	description?: string;
}

export interface ServicesStatus {
	services: {
		backend: ServiceInfo;
		ollama: ServiceInfo;
		whisper: ServiceInfo;
		tts: ServiceInfo;
		diffusion: ServiceInfo;
	};
	memory: Record<string, unknown>;
	active_model: string | null;
}

// ── YouTube / Engagement types ──────────────────────────────────────

export interface YouTubeVideoMeta {
	video_id: string;
	title: string;
	channel_name: string;
	channel_id: string;
	duration_seconds: number;
	thumbnail_url: string;
	upload_date: string;
	view_count: number | null;
	is_live: boolean;
	is_private: boolean;
	warning: string | null;
}

export interface YouTubeJobStatus {
	job_id: string;
	status: string;
	progress: number;
	message: string;
	result: Record<string, unknown> | null;
	error: string | null;
}

export interface EngagementSubScore {
	composite: number;
	/** False when there was nothing to measure; it isn't part of the grade */
	measured?: boolean;
	[key: string]: unknown;
}

export interface EngagementScoreResult {
	hook: EngagementSubScore;
	curiosity: EngagementSubScore;
	energy: EngagementSubScore;
	audio_sync: EngagementSubScore;
	face_presence: EngagementSubScore;
	emotional_arc: EngagementSubScore;
	virality: EngagementSubScore;
	suggestions: {
		signal: string;
		current_score: number;
		suggestion: string;
		action_type: string;
		expected_impact: string;
	}[];
	composite: number;
	grade: string;
	grade_label: string;
	/** Sub-scores that went into the grade */
	evaluated?: string[];
}

export type ChatContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

export interface ChatTurn {
	role: "user" | "assistant";
	content: string | ChatContentPart[];
}

export interface VisionSupport extends AIActiveLLM {
	ok: boolean;
	reason: string;
}

export type ComplianceCategoryId =
	| "claims"
	| "minors"
	| "watermark"
	| "product_ad";
export type ComplianceLevel = "atencao" | "risco";
export type ComplianceStatus = "ok" | ComplianceLevel;

export interface TikTokComplianceRequest {
	frames: { time: number; image: string }[];
	transcript: { start: number; end: number; text: string }[];
	ad_info?: string;
}

export interface ComplianceItem {
	level: ComplianceLevel;
	text: string;
	evidence: string;
	time: number | null;
	suggestion: string;
	source: "modelo" | "varredura";
}

export interface ComplianceCategoryResult {
	status: ComplianceStatus;
	items: ComplianceItem[];
}

export interface TikTokComplianceRefused {
	refused: true;
	reason: string;
	llm: AIActiveLLM;
}

export interface TikTokComplianceReport {
	refused: false;
	llm: AIActiveLLM;
	summary: string;
	categories: Record<ComplianceCategoryId, ComplianceCategoryResult>;
	frames_analyzed: number;
	transcript_used: boolean;
	ad_info_used: boolean;
}

export type TikTokComplianceResult =
	| TikTokComplianceRefused
	| TikTokComplianceReport;

export interface ScoredClipData {
	index: number;
	title: string;
	start: number;
	end: number;
	duration?: number;
	transcript_preview: string;
	tags: string[];
	engagement: EngagementScoreResult | null;
}

export interface ThumbnailScoreResult {
	index: number;
	overall: number;
	grade: string;
	contrast: number;
	text_readability: number;
	face_presence: number;
	color_vibrancy: number;
	composition: number;
	suggestion: string;
}

export interface ThumbnailScoreResponse {
	results: ThumbnailScoreResult[];
	winner_index: number;
	winner_score: number;
}

export interface HookVariantRequest {
	transcript_text?: string;
	transcript_segments?: { start: number; end: number; text: string }[];
	clip_start?: number;
	clip_end?: number;
	max_variants?: number;
}

export interface HookVariant {
	text: string;
	style: string;
	estimated_score: number;
	reason: string;
}

export interface HookVariantResponse {
	variants: HookVariant[];
	total: number;
}

export interface ScoreHistoryEntry {
	id: string;
	project_id: string;
	composite: number;
	grade: string;
	hook: EngagementSubScore;
	curiousity: EngagementSubScore;
	energy: EngagementSubScore;
	audio_sync: EngagementSubScore;
	face_presence: EngagementSubScore;
	emotional_arc: EngagementSubScore;
	virality: EngagementSubScore;
	type: string;
	created_at: number;
}

export interface ScoreHistoryResponse {
	history: ScoreHistoryEntry[];
	total: number;
}

export interface ScoreAnalyticsResponse {
	total_scored: number;
	avg_composite: number;
	grade_distribution: Record<string, number>;
	avg_sub_scores: Record<string, number>;
	trend: { timestamp: number; avg_composite: number; count: number }[];
	strongest_signal: string;
	weakest_signal: string;
}

// ── Visual / Semantic Search types ─────────────────────────────────

export interface EmbedTextResult {
	vector: number[];
	model: string;
	dim: number;
}

export interface EmbedTextsResult {
	vectors: number[][];
	model: string;
	dim: number;
}

export interface EmbedFramesResult {
	vectors: number[][];
	model: string;
	dim: number;
	count: number;
}

export interface ZeroShotTag {
	label: string;
	score: number;
}

export interface ZeroShotResult {
	tags: ZeroShotTag[];
	model: string;
}

export interface ClipServiceHealthResult {
	upstream?: {
		service: string;
		status: string;
		model: {
			loaded: boolean;
			name: string;
			pretrained: string;
			installed: boolean;
			error: string | null;
		};
		device: string;
		version: string;
	};
	reachable: boolean;
	url?: string;
	error?: string;
}

// ── Video background-removal job status ──────────────────────────────

export interface VideoBgResult {
	videoUrl: string;
	filename: string;
	fps: number;
	framesProcessed: number;
	duration: number;
	width?: number;
}

export interface VideoBgJobStatus {
	job_id: string;
	status: "queued" | "running" | "completed" | "failed";
	progress: number;
	message: string;
	total_frames: number | null;
	processed_frames: number;
	duration: number | null;
	result: VideoBgResult | null;
	error: string | null;
}

// ── Auto B-roll (CLIP embeddings) ────────────────────────────────────

export interface BRollFrameVector {
	timestamp: number;
	vector: number[];
	thumbnail: string; // data URL
}

export interface BRollAssetEmbedding {
	frames: BRollFrameVector[];
	count: number;
	model: string;
	dim: number;
}
