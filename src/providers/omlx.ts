/**
 * oMLX built-in provider definition
 *
 * oMLX (https://omlx.ai) is a macOS-native MLX inference server for Apple Silicon that
 * exposes an OpenAI-compatible API (default http://localhost:8000). It can serve LLM, VLM,
 * embedding, and reranker models simultaneously.
 *
 * This provider speaks the OpenAI wire protocol, so it delegates the actual chat/embedding
 * transport to the shared `createTransported*` helpers rather than duplicating them. What is
 * genuinely oMLX-specific lives here: setup instructions and model discovery via oMLX's
 * `/v1/models/status` extension, which carries an authoritative `model_type` per model so we
 * can split chat models from embedding models reliably (the generic OpenAI-compatible template
 * has no such endpoint and falls back to a heuristic).
 *
 * Authentication: baseUrl (required), apiKey (required — oMLX enables key verification by
 * default; the field may be left empty only if the user disabled it), headers (optional).
 */

import { requestUrl } from "obsidian";
import OmlxLogo from "../components/ui/logos/OmlxLogo.svelte";
import type {
	AuthObject,
	AuthValidationResult,
	ChatModelConfig,
	EmbeddingProviderDefinition,
} from "../types/provider/index";
import {
	createBufferedTransportedChatOpenAI,
	createTransportedChatOpenAI,
	createTransportedOpenAIEmbeddings,
} from "./chatProviders";

// =============================================================================
// Constants
// =============================================================================

/** Default oMLX server URL (macOS menu-bar app). */
const DEFAULT_BASE_URL = "http://localhost:8000";

// =============================================================================
// Helper Functions
// =============================================================================

/** Removes a trailing slash and a trailing `/v1` so we can append `/v1` ourselves. */
function sanitizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

/** Resolves the `/v1` API root from an auth object, falling back to the default. */
function resolveApiUrl(auth: AuthObject): string {
	return `${sanitizeBaseUrl(auth.baseUrl || DEFAULT_BASE_URL)}/v1`;
}

/** Builds request headers, applying optional apiKey + custom headers. */
function buildHeaders(auth: AuthObject): Record<string, string> {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (auth.apiKey) {
		headers.Authorization = `Bearer ${auth.apiKey}`;
	}
	if (auth.headers) {
		Object.assign(headers, auth.headers);
	}
	return headers;
}

/** Builds the ChatOpenAI/OpenAIEmbeddings `configuration` block (baseURL + optional headers). */
function buildClientConfiguration(auth: AuthObject): Record<string, unknown> {
	const configuration: Record<string, unknown> = { baseURL: resolveApiUrl(auth) };
	if (auth.headers && Object.keys(auth.headers).length > 0) {
		configuration.defaultHeaders = auth.headers;
	}
	return configuration;
}

// =============================================================================
// Types
// =============================================================================

interface OpenAIModelEntry {
	id?: string;
	/** Some servers set type="embedding" on embedding models. */
	type?: string;
	/** Alternate field name used by some servers. */
	object?: string;
}

interface OpenAIModelResponse {
	data?: Array<OpenAIModelEntry>;
}

interface ModelStatusEntry {
	id?: string;
	model_type?: string;
}

interface ModelsStatusResponse {
	models?: Array<ModelStatusEntry>;
}

/** Heuristic fallback when `/v1/models/status` is unavailable. */
function isEmbeddingEntry(entry: OpenAIModelEntry): boolean {
	return entry.type === "embedding" || entry.object === "embedding";
}

/** Fetches the raw `/v1/models` entries. */
async function fetchModelEntries(auth: AuthObject): Promise<OpenAIModelEntry[]> {
	const response = await requestUrl({
		url: `${resolveApiUrl(auth)}/models`,
		method: "GET",
		headers: buildHeaders(auth),
		throw: false,
	});

	if (response.status < 200 || response.status >= 300) {
		throw new Error(`oMLX 模型发现失败：${response.text || `状态码 ${response.status}`}`);
	}

	const payload = response.json as OpenAIModelResponse;
	return Array.isArray(payload.data) ? payload.data : [];
}

/**
 * Fetches oMLX's `/v1/models/status` extension, which carries an authoritative `model_type`
 * per model. Returns a map of model id → model_type, or null if the endpoint is unavailable.
 */
async function fetchModelTypeMap(auth: AuthObject): Promise<Map<string, string> | null> {
	try {
		const response = await requestUrl({
			url: `${resolveApiUrl(auth)}/models/status`,
			method: "GET",
			headers: buildHeaders(auth),
			throw: false,
		});
		if (response.status < 200 || response.status >= 300) return null;

		const payload = response.json as ModelsStatusResponse;
		if (!Array.isArray(payload.models)) return null;

		const map = new Map<string, string>();
		for (const entry of payload.models) {
			if (entry.id && entry.model_type) {
				map.set(entry.id, entry.model_type);
			}
		}
		return map.size > 0 ? map : null;
	} catch {
		return null;
	}
}

/** Discovers models of a given kind (chat = non-embedding, embedding = embedding). */
async function discoverModelsByKind(auth: AuthObject, kind: "chat" | "embedding"): Promise<string[]> {
	const [entries, typeMap] = await Promise.all([fetchModelEntries(auth), fetchModelTypeMap(auth)]);
	return entries
		.filter((entry) => {
			if (!entry.id) return false;
			const isEmbedding = typeMap ? typeMap.get(entry.id) === "embedding" : isEmbeddingEntry(entry);
			return kind === "embedding" ? isEmbedding : !isEmbedding;
		})
		.map((entry) => entry.id as string);
}

// =============================================================================
// Provider Definition
// =============================================================================

/**
 * Creates an oMLX provider instance definition.
 *
 * @param instanceId - Persisted provider instance id.
 * @param displayName - User-visible display name.
 */
export function createOmlxProvider(instanceId: string, displayName: string): EmbeddingProviderDefinition {
	return {
		// =====================================================================
		// Identity
		// =====================================================================
		id: instanceId,
		displayName,
		logo: OmlxLogo,

		// =====================================================================
		// Setup Instructions
		// =====================================================================
		setupInstructions: {
			steps: [
				"从 omlx.ai 下载并安装 macOS 版 oMLX",
				"启动 oMLX，并从菜单栏应用启动服务",
				"从 oMLX 面板下载模型（LLM、VLM 或嵌入模型）",
				"默认服务器 URL 为 http://localhost:8000",
			],
			link: {
				url: "https://omlx.ai",
				text: "oMLX 官网",
			},
		},

		// =====================================================================
		// Auth Configuration
		// =====================================================================
		auth: {
			baseUrl: {
				label: "服务器 URL",
				description: "你的 oMLX 服务运行所在的 URL",
				kind: "text",
				required: true,
				placeholder: DEFAULT_BASE_URL,
			},
			apiKey: {
				label: "API 密钥",
				description:
					"oMLX 默认需要 API 密钥（可在管理面板的全局设置中找到）。仅在你关闭了密钥校验时才留空。",
				kind: "secret",
				required: true,
			},
			headers: {
				label: "自定义请求头",
				description: "以 JSON 填写的附加请求头（可选）",
				kind: "textarea",
				required: false,
				placeholder: '{"X-Custom-Header": "value"}',
			},
		},

		// =====================================================================
		// Runtime Methods — transport delegated to shared helpers
		// =====================================================================

		createChatInstance: (auth: AuthObject, modelId: string, options?: Partial<ChatModelConfig>) => {
			const chatConfig: Record<string, unknown> = {
				model: modelId,
				apiKey: auth.apiKey || "not-required",
				configuration: buildClientConfiguration(auth),
			};
			if (options?.temperature !== undefined) {
				chatConfig.temperature = options.temperature;
			}
			return createTransportedChatOpenAI(instanceId, chatConfig);
		},

		createSubAgentChatInstance: (auth: AuthObject, modelId: string, options?: Partial<ChatModelConfig>) => {
			const chatConfig: Record<string, unknown> = {
				model: modelId,
				apiKey: auth.apiKey || "not-required",
				configuration: buildClientConfiguration(auth),
			};
			if (options?.temperature !== undefined) {
				chatConfig.temperature = options.temperature;
			}
			return createBufferedTransportedChatOpenAI(instanceId, chatConfig);
		},

		createEmbeddingInstance: (auth: AuthObject, modelId: string) => {
			const embeddingConfig: Record<string, unknown> = {
				model: modelId,
				apiKey: auth.apiKey || "not-required",
				encodingFormat: "float",
				configuration: buildClientConfiguration(auth),
			};
			return createTransportedOpenAIEmbeddings(embeddingConfig);
		},

		validateAuth: async (auth: AuthObject): Promise<AuthValidationResult> => {
			try {
				const response = await requestUrl({
					url: `${resolveApiUrl(auth)}/models`,
					method: "GET",
					headers: buildHeaders(auth),
					throw: false,
				});

				if (response.status >= 200 && response.status < 300) {
					return { valid: true };
				}

				let errorMessage: string | undefined;
				try {
					const parsed = response.json as { error?: { message?: string } };
					errorMessage = parsed?.error?.message;
				} catch {
					errorMessage = undefined;
				}

				if (response.status === 401 || response.status === 403) {
					return { valid: false, error: errorMessage || "身份验证失败" };
				}

				return { valid: false, error: errorMessage || `请求失败，状态码 ${response.status}` };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { valid: false, error: `连接失败：${message}` };
			}
		},

		discoverModels: (auth: AuthObject): Promise<string[]> => discoverModelsByKind(auth, "chat"),

		discoverEmbeddingModels: (auth: AuthObject): Promise<string[]> => discoverModelsByKind(auth, "embedding"),
	};
}
