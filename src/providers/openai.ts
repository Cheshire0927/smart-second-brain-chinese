/**
 * OpenAI built-in provider definition
 *
 * This provider supports:
 * - Chat models (gpt-4o, gpt-4o-mini, gpt-4-turbo, etc.)
 * - Embedding models (text-embedding-3-small, text-embedding-3-large, etc.)
 * - Model discovery via OpenAI API
 *
 * Authentication: apiKey (required), baseUrl (optional), headers (optional)
 */

import { fetchModelsDevData, isEmbeddingModel } from "./modelsDevApi";
import { getPlugin } from "../stores/state.svelte";
import OpenAILogo from "../components/ui/logos/OpenAILogo.svelte";
import type {
	AuthObject,
	AuthValidationResult,
	ChatModelConfig,
	EmbeddingProviderDefinition,
} from "../types/provider/index";
import {
	cancelOpenAICodexSignIn,
	clearOpenAICodexSession,
	createOpenAICodexFetch,
	getValidOpenAICodexSession,
	signInWithOpenAICodex,
} from "./openaiCodex";
import { getCodexSession } from "../stores/providerRuntime.svelte";
import {
	createBufferedTransportedChatOpenAI,
	createTransportedChatOpenAI,
	createTransportedChatOpenAIResponses,
	createTransportedOpenAIEmbeddings,
} from "./chatProviders";

// =============================================================================
// Constants
// =============================================================================

/** Default base URL for OpenAI API */
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const FALLBACK_OPENAI_CHAT_MODELS = ["chatgpt-4o-latest", "gpt-4.1-mini-2025-04-14", "gpt-4.1", "o4-mini", "o1"];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Removes trailing slashes from a URL.
 */
function sanitizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, "");
}

/**
 * Safely reads response text, returning undefined on error.
 */
async function safeReadText(response: Response): Promise<string | undefined> {
	try {
		return await response.text();
	} catch {
		return undefined;
	}
}

// =============================================================================
// API Response Types
// =============================================================================

interface OpenAIModelResponse {
	data?: Array<{ id?: string }>;
}

// =============================================================================
// Provider Definition
// =============================================================================

/**
 * OpenAI built-in provider definition.
 *
 * Supports chat models, embedding models, and model discovery.
 */
export const openaiProvider: EmbeddingProviderDefinition = {
	// =========================================================================
	// Identity
	// =========================================================================
	id: "openai",
	displayName: "OpenAI",
	logo: OpenAILogo,

	// =========================================================================
	// Setup Instructions
	// =========================================================================
	setupInstructions: {
		steps: [
			"在 OpenAI Dashboard 中创建 API 密钥",
			"确认你的 OpenAI 账户已充值",
			"将 API 密钥粘贴到下方（以 'sk-' 开头）",
		],
		link: {
			url: "https://platform.openai.com/api-keys",
			text: "OpenAI Dashboard",
		},
	},

	// =========================================================================
	// OAuth (ChatGPT sign-in) capability
	// =========================================================================
	oauth: {
		label: "ChatGPT",
		icon: "log-in",
		description: "在浏览器中打开窗口完成 ChatGPT/Codex 授权。",
		signIn: async () => {
			await signInWithOpenAICodex();
			return { kind: "session" };
		},
		cancelSignIn: cancelOpenAICodexSignIn,
		isSignedIn: () => !!getCodexSession(),
		disconnect: clearOpenAICodexSession,
		supportsApiKey: true,
	},

	// =========================================================================
	// Auth Configuration
	// =========================================================================
	auth: {
		apiKey: {
			label: "API 密钥",
			description: "用于身份验证的 OpenAI API 密钥",
			kind: "secret",
			required: true,
			placeholder: "sk-...",
		},
		baseUrl: {
			label: "基础 URL",
			description: "自定义 API 端点（留空则使用 OpenAI 默认端点）",
			kind: "text",
			required: false,
			placeholder: "https://api.openai.com/v1",
		},
		headers: {
			label: "自定义请求头",
			description: "以 JSON 填写的附加请求头（可选）",
			kind: "textarea",
			required: false,
			placeholder: '{"X-Custom-Header": "value"}',
		},
	},

	// =========================================================================
	// Runtime Methods
	// =========================================================================

	createChatInstance: (auth: AuthObject, modelId: string, options?: Partial<ChatModelConfig>) => {
		if (auth.authMode === "codex") {
			return createTransportedChatOpenAIResponses("openai", {
				model: modelId,
				apiKey: async () => {
					const session = await getValidOpenAICodexSession();
					if (!session) {
						throw new Error("需要登录 ChatGPT");
					}
					return session.accessToken;
				},
				configuration: {
					baseURL: OPENAI_DEFAULT_BASE_URL,
					fetch: createOpenAICodexFetch(),
				},
				temperature: options?.temperature,
			});
		}

		const config: Record<string, unknown> = {
			model: modelId,
			apiKey: auth.apiKey,
		};

		if (options?.temperature !== undefined) {
			config.temperature = options.temperature;
		}

		// Add baseUrl configuration if provided
		if (auth.baseUrl && auth.baseUrl.trim() !== "") {
			config.configuration = {
				baseURL: sanitizeBaseUrl(auth.baseUrl),
			};
		}

		// Add custom headers if provided
		if (auth.headers && Object.keys(auth.headers).length > 0) {
			config.configuration = {
				...(config.configuration as Record<string, unknown>),
				defaultHeaders: auth.headers,
			};
		}

		return createTransportedChatOpenAI("openai", config);
	},

	createSubAgentChatInstance: (auth: AuthObject, modelId: string, options?: Partial<ChatModelConfig>) => {
		// Codex (ChatGPT sign-in) has no API key — authenticate via the Codex session
		// transport, mirroring createChatInstance. Without this branch the subagent reads
		// the absent auth.apiKey and fails with missing authentication.
		if (auth.authMode === "codex") {
			return createTransportedChatOpenAIResponses("openai", {
				model: modelId,
				apiKey: async () => {
					const session = await getValidOpenAICodexSession();
					if (!session) {
						throw new Error("需要登录 ChatGPT");
					}
					return session.accessToken;
				},
				configuration: {
					baseURL: OPENAI_DEFAULT_BASE_URL,
					fetch: createOpenAICodexFetch(),
				},
				temperature: options?.temperature,
			});
		}

		const config: Record<string, unknown> = { model: modelId, apiKey: auth.apiKey };
		if (options?.temperature !== undefined) {
			config.temperature = options.temperature;
		}
		if (auth.baseUrl && auth.baseUrl.trim() !== "") {
			config.configuration = { baseURL: sanitizeBaseUrl(auth.baseUrl) };
		}
		if (auth.headers && Object.keys(auth.headers).length > 0) {
			config.configuration = {
				...(config.configuration as Record<string, unknown>),
				defaultHeaders: auth.headers,
			};
		}
		return createBufferedTransportedChatOpenAI("openai", config);
	},

	createEmbeddingInstance: (auth: AuthObject, modelId: string) => {
		if (auth.authMode === "codex") {
			throw new Error("Codex 登录不支持嵌入模型");
		}

		const config: Record<string, unknown> = {
			model: modelId,
			apiKey: auth.apiKey,
		};

		// Add baseUrl configuration if provided
		if (auth.baseUrl && auth.baseUrl.trim() !== "") {
			config.configuration = {
				baseURL: sanitizeBaseUrl(auth.baseUrl),
			};
			// OpenAI SDK v6 defaults to encoding_format:'base64' which many third-party
			// providers don't support, causing malformed responses. Use 'float' explicitly
			// when a custom baseUrl is set (i.e. not targeting OpenAI directly).
			config.encodingFormat = "float";
		}

		// Add custom headers if provided
		if (auth.headers && Object.keys(auth.headers).length > 0) {
			config.configuration = {
				...(config.configuration as Record<string, unknown>),
				defaultHeaders: auth.headers,
			};
		}

		return createTransportedOpenAIEmbeddings(config);
	},

	validateAuth: async (auth: AuthObject): Promise<AuthValidationResult> => {
		if (auth.authMode === "codex") {
			const session = await getValidOpenAICodexSession();
			if (!session) {
				return { valid: false, error: "请登录 ChatGPT 以通过 Codex 使用 OpenAI" };
			}
			return { valid: true };
		}

		if (!auth.apiKey?.trim()) {
			return { valid: false, error: "需要 API 密钥" };
		}

		const baseUrl =
			auth.baseUrl && auth.baseUrl.trim() !== "" ? sanitizeBaseUrl(auth.baseUrl) : OPENAI_DEFAULT_BASE_URL;

		const headers: Record<string, string> = {
			Authorization: `Bearer ${auth.apiKey}`,
			"Content-Type": "application/json",
		};

		// Add custom headers if provided
		if (auth.headers) {
			Object.assign(headers, auth.headers);
		}

		let response: Response;
		try {
			response = await window.fetch(`${baseUrl}/models`, {
				method: "GET",
				headers,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { valid: false, error: `连接失败：${message}` };
		}

		if (response.ok) {
			return { valid: true };
		}

		// Handle error response
		const errorBody = await safeReadText(response);
		let errorCode: string | undefined;
		let errorMessage: string | undefined;
		try {
			const parsed = errorBody
				? (JSON.parse(errorBody) as { error?: { code?: string; message?: string } })
				: undefined;
			errorCode = parsed?.error?.code;
			errorMessage = parsed?.error?.message;
		} catch {
			// ignore parse errors
		}

		if (response.status === 401 || response.status === 403 || errorCode === "invalid_api_key") {
			return { valid: false, error: errorMessage || `身份验证失败（${response.status}）` };
		}

		return { valid: false, error: errorMessage || errorBody || `请求失败，状态码 ${response.status}` };
	},

	discoverModels: async (auth: AuthObject): Promise<string[]> => {
		if (auth.authMode === "codex") {
			const modelsDevData = await fetchModelsDevData();
			const modelsDevOpenAI = modelsDevData?.openai;
			if (modelsDevOpenAI) {
				const discovered = Array.from(
					new Set(
						Object.values(modelsDevOpenAI.models)
							.filter((model) => !isEmbeddingModel(model))
							.map((model) => model.id?.split("/").pop()?.trim())
							.filter((id): id is string => Boolean(id)),
					),
				);

				if (discovered.length > 0) {
					return discovered.sort((a, b) => a.localeCompare(b));
				}
			}

			return Array.from(
				new Set([
					...FALLBACK_OPENAI_CHAT_MODELS,
					...Object.keys(getPlugin().pluginData.getChatModels("openai")),
				]),
			).sort((a, b) => a.localeCompare(b));
		}

		if (!auth.apiKey) {
			throw new Error("发现 OpenAI 模型需要 API 密钥。");
		}

		const baseUrl =
			auth.baseUrl && auth.baseUrl.trim() !== "" ? sanitizeBaseUrl(auth.baseUrl) : OPENAI_DEFAULT_BASE_URL;

		const headers: Record<string, string> = {
			Authorization: `Bearer ${auth.apiKey}`,
			"Content-Type": "application/json",
		};

		// Add custom headers if provided
		if (auth.headers) {
			Object.assign(headers, auth.headers);
		}

		const response = await window.fetch(`${baseUrl}/models`, {
			method: "GET",
			headers,
		});

		if (!response.ok) {
			const errorBody = await safeReadText(response);
			throw new Error(`模型发现失败：${errorBody || response.statusText}`);
		}

		const payload = (await response.json()) as OpenAIModelResponse;
		const resources = Array.isArray(payload.data) ? payload.data : [];

		return resources.map((r) => r.id).filter((id): id is string => typeof id === "string" && id.trim() !== "");
	},

	discoverEmbeddingModels: async (auth: AuthObject): Promise<string[]> => {
		if (auth.authMode === "codex") {
			return [];
		}

		const allModels = await openaiProvider.discoverModels(auth);
		return allModels.filter((model) => model.toLowerCase().includes("embed"));
	},
};
