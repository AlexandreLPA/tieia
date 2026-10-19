import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AIClientError, aiClient } from "@/lib/ai-client";

type RecordedCall = {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: unknown;
};

const BASE = "http://localhost:8420";
const realFetch = globalThis.fetch;
let calls: RecordedCall[] = [];
let respond: (url: string) => Response = () => jsonResponse({ ok: true });

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function ndjsonResponse(lines: unknown[]): Response {
	return new Response(lines.map((line) => JSON.stringify(line)).join("\n"), {
		status: 200,
		headers: { "Content-Type": "application/x-ndjson" },
	});
}

function describeBody(body: BodyInit | null | undefined): unknown {
	if (body === undefined || body === null) return null;
	if (typeof body === "string") return body;
	if (body instanceof FormData) {
		return [...body.entries()].map(([key, value]) => [
			key,
			typeof value === "string" ? value : `<file ${value.name}>`,
		]);
	}
	return `<${Object.prototype.toString.call(body)}>`;
}

function recordingFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
	const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	calls.push({
		url: url.replace(BASE, ""),
		method: init.method ?? "GET",
		headers: Object.fromEntries(new Headers(init.headers).entries()),
		body: describeBody(init.body),
	});
	return Promise.resolve(respond(url));
}

beforeEach(() => {
	calls = [];
	respond = () => jsonResponse({ ok: true });
	globalThis.fetch = recordingFetch as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	Reflect.deleteProperty(globalThis, "window");
	Reflect.deleteProperty(globalThis, "localStorage");
});

// Every public method of aiClient today. The split into per-area files must keep all of them.
const PUBLIC_METHODS = [
	"getBaseUrl", "health", "transcribe", "analyzeFillers", "analyzeSilences", "analyzeStructure",
	"getSuggestions", "executeCommand", "generateImage", "enhancePrompt", "generateInfographic",
	"removeBackground", "removeVideoBackground", "getVideoBgJob", "videoBgFileUrl", "embedAssetFrames",
	"embedBRollQuery", "generateSpeech", "generateSpeechBlob", "cloneVoice", "generateSubtitles", "chat",
	"chatStream", "chatStreamMessages", "getVisionSupport", "translateText", "nllbTranslate",
	"nllbTranslateBatch", "nllbTranslateStatus", "sarvamTranscribe", "sarvamTranslate", "sarvamTTS",
	"sarvamDetectLanguage", "sarvamTransliterate", "sarvamStatus", "smallestTTS", "smallestTranscribe",
	"smallestVoices", "smallestStatus", "factCheck", "llmStatus", "setCloudModel", "setLocalBackend",
	"pullModel", "setLLMModel", "downloadModel", "getMemoryStatus", "getServicesStatus", "pullOllamaModel",
	"prepareWhisper", "prepareTTS", "updateConfig", "prepareDiffusion", "analyzeEmotions", "detectFaces",
	"analyzeSpeakers", "findClips", "extractKeywords", "generateQuestionCards", "suggestBRoll",
	"denoiseAudio", "transcodeAlphaVideo", "exportRender", "generateReelTemplate", "startTemplateJob",
	"getTemplateJob", "listTemplateJobs", "turboquantStatus", "turboquantModelTiers",
	"turboquantKVConfigurations", "turboquantEstimate", "turboquantRecommend", "turboquantApplyTier",
	"turboquantListModels", "turboquantModelCatalog", "turboquantDownloadModel", "turboquantLoadModel",
	"turboquantUnloadModel", "turboquantDeleteModel", "generateVideoPrompt", "generateVideo", "getVideoJob",
	"youtubeIngest", "youtubeJobStatus", "youtubeCancel", "youtubeAnalyze", "youtubeGenerateClips",
	"engagementScore", "engagementScoreVideo", "engagementScoreBatch", "scoreThumbnails",
	"generateHookVariants", "checkTikTokCompliance", "recordScore", "getScoreHistory", "getScoreAnalytics",
	"embedText", "embedTexts", "embedFrames", "zeroShotTags", "clipServiceHealth",
] as const;

type AnyMethod = (...args: unknown[]) => unknown;

function method(name: string): AnyMethod {
	const fn = (aiClient as unknown as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`aiClient.${name} is missing`);
	return (fn as AnyMethod).bind(aiClient);
}

describe("aiClient public surface", () => {
	test("exposes every public method", () => {
		for (const name of PUBLIC_METHODS) {
			expect(typeof (aiClient as unknown as Record<string, unknown>)[name]).toBe("function");
		}
	});

	test("points at the default backend URL", () => {
		expect(aiClient.getBaseUrl()).toBe(BASE);
	});
});

describe("aiClient request contract", () => {
	// Fixed synthetic arguments by position. The values do not need to make sense for each
	// method: the snapshot records what each method sends today, so a refactor that changes
	// a URL, an HTTP verb, a header or a payload shows up as a snapshot diff.
	const sampleFile = new File(["sample"], "sample.wav", { type: "audio/wav" });
	const formData = new FormData();
	formData.append("frame", sampleFile);
	const ARGS: unknown[] = [sampleFile, "arg-1", "arg-2", 3, 4, 5];
	const ARGS_BY_METHOD: Record<string, unknown[]> = {
		embedFrames: [formData],
		zeroShotTags: [formData, ["cat", "dog"]],
		updateConfig: [{ key: "value" }],
		embedTexts: [["a", "b"]],
		nllbTranslateBatch: [["a", "b"], "en", "pt"],
		chatStreamMessages: [[{ role: "user", content: "oi" }], () => {}],
		chatStream: ["oi", () => {}, "system"],
	};

	async function settle(name: string): Promise<unknown> {
		const args = ARGS_BY_METHOD[name] ?? ARGS;
		const outcome = Promise.resolve()
			.then(() => method(name)(...args))
			.then(
				(value: unknown) => (typeof value === "string" ? `resolved: ${value}` : "resolved"),
				(error: unknown) => `rejected: ${error instanceof Error ? error.message : String(error)}`,
			);
		const pending = new Promise((resolve) => setTimeout(() => resolve("pending"), 200));
		return Promise.race([outcome, pending]);
	}

	for (const name of PUBLIC_METHODS) {
		test(name, async () => {
			respond = (url) =>
				url.includes("/stream") || url.includes("pull") || url.includes("download")
					? ndjsonResponse([{ ping: true }, { token: "a" }, { done: true, result: { ok: true } }])
					: jsonResponse({ ok: true, response: "ok", status: "done", models: [] });
			const outcome = await settle(name);
			expect({ outcome, calls }).toMatchSnapshot();
		});
	}
});

describe("aiClient error handling", () => {
	test("5xx becomes backend_error with the status code", async () => {
		respond = () => new Response("boom", { status: 503 });
		const error = await aiClient.health().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AIClientError);
		expect((error as AIClientError).errorType).toBe("backend_error");
		expect((error as AIClientError).statusCode).toBe(503);
		expect((error as AIClientError).message).toBe("AI Backend error (503): boom");
	});

	test("4xx becomes network_error", async () => {
		respond = () => new Response("missing", { status: 404 });
		const error = (await aiClient.health().catch((e: unknown) => e)) as AIClientError;
		expect(error.errorType).toBe("network_error");
		expect(error.statusCode).toBe(404);
	});

	test("a refused connection becomes connection_refused", async () => {
		globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
		const error = (await aiClient.health().catch((e: unknown) => e)) as AIClientError;
		expect(error.errorType).toBe("connection_refused");
	});

	test("an aborted request becomes timeout", async () => {
		globalThis.fetch = (() =>
			Promise.reject(new DOMException("aborted", "AbortError"))) as unknown as typeof fetch;
		const error = (await aiClient.health().catch((e: unknown) => e)) as AIClientError;
		expect(error.errorType).toBe("timeout");
	});

	test("keepalive streams skip pings and return the result", async () => {
		respond = () => ndjsonResponse([{ ping: true }, { ping: true }, { result: { claims: [], summary: "ok" } }]);
		await expect(aiClient.factCheck("texto")).resolves.toEqual({ claims: [], summary: "ok" });
	});

	test("keepalive streams turn an error line into backend_error", async () => {
		respond = () => ndjsonResponse([{ ping: true }, { error: "modelo sobrecarregado" }]);
		const error = (await aiClient.factCheck("texto").catch((e: unknown) => e)) as AIClientError;
		expect(error).toBeInstanceOf(AIClientError);
		expect(error.errorType).toBe("backend_error");
		expect(error.message).toBe("modelo sobrecarregado");
	});
});

describe("aiClient API key passthrough", () => {
	test("sends the Sarvam key saved in localStorage as a header", async () => {
		const store = new Map([["opencut-api-keys", JSON.stringify({ sarvam: " sk-test " })]]);
		Object.assign(globalThis, {
			window: globalThis,
			localStorage: { getItem: (key: string) => store.get(key) ?? null },
		});
		await aiClient.sarvamStatus();
		expect(calls[0].headers["x-sarvam-api-key"]).toBe("sk-test");
	});

	test("sends no key header when nothing is saved", async () => {
		await aiClient.sarvamStatus();
		expect(calls[0].headers["x-sarvam-api-key"]).toBeUndefined();
	});
});
