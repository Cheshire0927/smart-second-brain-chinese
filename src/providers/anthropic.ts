/**
 * Anthropic built-in provider definition
 *
 * This provider supports:
 * - Chat models (claude-3-5-sonnet, claude-3-5-haiku, claude-3-opus, etc.)
 * - NO embedding models (Anthropic doesn't offer embeddings)
 * - Model discovery via Anthropic API (/v1/models)
 *
 * Authentication: apiKey (required), baseUrl (optional), headers (optional)
 */

import { requestUrl } from "obsidian";
import AnthropicLogo from "../components/ui/logos/AnthropicLogo.svelte";
import type {
	AuthObject,
	AuthValidationResult,
	BaseProviderDefinition,
	ChatModelConfig,
} from "../types/provider/index";
import { createBufferedTransportedChatAnthropic, createTransportedChatAnthropic } from "./chatProviders";

// =============================================================================
// Constants
// =============================================================================

/** Default base URL for Anthropic API */
const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";

/** Anthropic API version header value */
const ANTHROPIC_API_VERSION = "2023-06-01";

// =============================================================================
// Helper Functions
// =============================================================================

function sanitizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, "");
}

function buildAnthropicHeaders(auth: AuthObject): Record<string, string> {
	const headers: Record<string, string> = {
		"x-api-key": auth.apiKey ?? "",
		"anthropic-version": ANTHROPIC_API_VERSION,
		"Content-Type": "application/json",
	};

	if (auth.headers) {
		Object.assign(headers, auth.headers);
	}

	return headers;
}

// =============================================================================
// Types
// =============================================================================

interface AnthropicModelResponse {
	data: Array<{
		id: string;
		created_at?: string;
		display_name?: string;
		type?: string;
	}>;
	has_more?: boolean;
}

// =============================================================================
// Provider Definition
// =============================================================================

/**
 * Anthropic built-in provider definition.
 *
 * Supports chat models only (no embeddings).
 */
export const anthropicProvider: BaseProviderDefinition = {
	// =========================================================================
	// Identity
	// =========================================================================
	id: "anthropic",
	displayName: "Anthropic",
	logo: AnthropicLogo,

	// =========================================================================
	// Setup Instructions
	// =========================================================================
	setupInstructions: {
		steps: [
			"在 Anthropic Console 中创建 API 密钥",
			"确认你的 Anthropic 账户有可用额度",
			"将 API 密钥粘贴到下方（以 'sk-ant-' 开头）",
		],
		link: {
			url: "https://console.anthropic.com/settings/keys",
			text: "Anthropic Console",
		},
	},

	// =========================================================================
	// Auth Configuration
	// =========================================================================
	auth: {
		apiKey: {
			label: "API 密钥",
			description: "用于身份验证的 Anthropic API 密钥",
			kind: "secret",
			required: true,
			placeholder: "sk-ant-...",
		},
		baseUrl: {
			label: "基础 URL",
			description: "Anthropic 兼容 API 端点的基础 URL",
			kind: "text",
			required: false,
			placeholder: ANTHROPIC_DEFAULT_BASE_URL,
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
		const resolvedBaseUrl = sanitizeBaseUrl(auth.baseUrl || ANTHROPIC_DEFAULT_BASE_URL);
		const config: Record<string, unknown> = {
			model: modelId,
			apiKey: auth.apiKey,
			clientOptions: {
				baseURL: resolvedBaseUrl,
				defaultHeaders: auth.headers,
			},
		};

		if (options?.temperature !== undefined) {
			config.temperature = options.temperature;
		}

		// Forward Anthropic-specific `thinking` config when provided (e.g. to
		// disable extended thinking for lightweight tasks like cluster labeling).
		if (options && "thinking" in options && options.thinking !== undefined) {
			config.thinking = options.thinking;
		}

		return createTransportedChatAnthropic("anthropic", config);
	},

	createSubAgentChatInstance: (auth: AuthObject, modelId: string, options?: Partial<ChatModelConfig>) => {
		const resolvedBaseUrl = sanitizeBaseUrl(auth.baseUrl || ANTHROPIC_DEFAULT_BASE_URL);
		const config: Record<string, unknown> = {
			model: modelId,
			apiKey: auth.apiKey,
			clientOptions: { baseURL: resolvedBaseUrl, defaultHeaders: auth.headers },
		};
		if (options?.temperature !== undefined) {
			config.temperature = options.temperature;
		}
		if (options && "thinking" in options && options.thinking !== undefined) {
			config.thinking = options.thinking;
		}
		return createBufferedTransportedChatAnthropic("anthropic", config);
	},

	validateAuth: async (auth: AuthObject): Promise<AuthValidationResult> => {
		if (!auth.apiKey?.trim()) {
			return { valid: false, error: "需要 API 密钥" };
		}

		try {
			const baseUrl = sanitizeBaseUrl(auth.baseUrl || ANTHROPIC_DEFAULT_BASE_URL);
			const response = await requestUrl({
				url: `${baseUrl}/v1/models`,
				method: "GET",
				headers: buildAnthropicHeaders(auth),
				throw: false,
			});

			if (response.status >= 200 && response.status < 300) {
				return { valid: true };
			}

			let errorType: string | undefined;
			let errorMessage: string | undefined;
			try {
				const parsed = response.json as { error?: { type?: string; message?: string } };
				errorType = parsed?.error?.type;
				errorMessage = parsed?.error?.message;
			} catch {
				// ignore parse errors
			}

			if (response.status === 401 || response.status === 403 || errorType === "authentication_error") {
				return { valid: false, error: errorMessage || `身份验证失败（${response.status}）` };
			}

			return {
				valid: false,
				error: errorMessage || response.text || `请求失败，状态码 ${response.status}`,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { valid: false, error: `连接失败：${message}` };
		}
	},

	discoverModels: async (auth: AuthObject): Promise<string[]> => {
		if (!auth.apiKey?.trim()) {
			throw new Error("发现 Anthropic 模型需要 API 密钥。");
		}

		const baseUrl = sanitizeBaseUrl(auth.baseUrl || ANTHROPIC_DEFAULT_BASE_URL);
		const response = await requestUrl({
			url: `${baseUrl}/v1/models`,
			method: "GET",
			headers: buildAnthropicHeaders(auth),
			throw: false,
		});

		if (response.status < 200 || response.status >= 300) {
			throw new Error(`模型发现失败：${response.text || `状态码 ${response.status}`}`);
		}

		const payload = response.json as AnthropicModelResponse;
		const resources = Array.isArray(payload.data) ? payload.data : [];

		return resources.map((r) => r.id).filter((id): id is string => typeof id === "string" && id.trim() !== "");
	},
};
