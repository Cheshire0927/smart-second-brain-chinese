/**
 * Ollama built-in provider definition
 *
 * This provider supports:
 * - Chat models (llama3.1, mistral, codellama, etc.)
 * - Embedding models (nomic-embed-text, mxbai-embed-large, etc.)
 * - Model discovery via Ollama API (/api/tags)
 *
 * Authentication: baseUrl (required), apiKey (optional), headers (optional)
 * Ollama runs locally on the user's machine, defaulting to http://localhost:11434
 */

import { Logger } from "../utils/logging";
import OllamaLogo from "../components/ui/logos/OllamaLogo.svelte";
import type {
	AuthObject,
	AuthValidationResult,
	ChatModelConfig,
	EmbeddingProviderDefinition,
} from "../types/provider/index";
import { fetchOllamaModelsInfo, OLLAMA_EMBED_NUM_CTX } from "./ollamaModels";
import { createTransportedChatOllama, createTransportedOllamaEmbeddings } from "./chatProviders";

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
// Types
// =============================================================================

interface OllamaTagsResponse {
	models?: Array<{ name?: string }>;
}

// =============================================================================
// Provider Definition
// =============================================================================

/**
 * Ollama built-in provider definition.
 *
 * Supports chat models, embedding models, and model discovery.
 */
export const ollamaProvider: EmbeddingProviderDefinition = {
	// =========================================================================
	// Identity
	// =========================================================================
	id: "ollama",
	displayName: "Ollama",
	logo: OllamaLogo,

	// =========================================================================
	// Setup Instructions
	// =========================================================================
	setupInstructions: {
		steps: [
			"从 ollama.ai 安装 Ollama",
			"运行 'ollama serve' 启动服务",
			"用 'ollama pull llama3.1' 拉取模型",
			"默认 URL 为 http://localhost:11434",
		],
		link: {
			url: "https://ollama.ai",
			text: "Ollama 官网",
		},
	},

	// =========================================================================
	// Auth Configuration
	// =========================================================================
	auth: {
		baseUrl: {
			label: "服务器 URL",
			description: "你的 Ollama 服务运行所在的 URL",
			kind: "text",
			required: true,
			placeholder: "http://localhost:11434",
		},
		apiKey: {
			label: "API 密钥",
			description: "用于身份验证的 API 密钥（本地 Ollama 通常不需要）",
			kind: "secret",
			required: false,
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
		if (!auth.baseUrl) {
			throw new Error("Ollama requires a server URL");
		}

		const config: Record<string, unknown> = {
			model: modelId,
			baseUrl: sanitizeBaseUrl(auth.baseUrl),
		};

		if (options?.temperature !== undefined) {
			config.temperature = options.temperature;
		}

		// Add contextWindow as numCtx (Ollama-specific parameter)
		if (options?.contextWindow !== undefined) {
			config.numCtx = options.contextWindow;
		}

		return createTransportedChatOllama("ollama", config);
	},

	createEmbeddingInstance: (auth: AuthObject, modelId: string) => {
		if (!auth.baseUrl) {
			throw new Error("Ollama requires a server URL");
		}

		return createTransportedOllamaEmbeddings({
			model: modelId,
			baseUrl: sanitizeBaseUrl(auth.baseUrl),
			// The server bounds embed input by min(num_ctx, model context), and
			// its num_ctx default is a VRAM-dependent 4k+ the client cannot read.
			// Pin it, so the chunk budget (`hydrateEmbeddingModel` caps Ollama
			// models to the same number) is the limit the server enforces (#485).
			requestOptions: { numCtx: OLLAMA_EMBED_NUM_CTX },
			// Backstop for chunks denser than the chars-per-token estimate (JSON,
			// code): a truncated vector still finds the note by its opening,
			// whereas a rejected one drops the note from the index entirely.
			truncate: true,
		});
	},

	validateAuth: async (auth: AuthObject): Promise<AuthValidationResult> => {
		if (!auth.baseUrl?.trim()) {
			return { valid: false, error: "需要服务器 URL" };
		}

		const baseUrl = sanitizeBaseUrl(auth.baseUrl);

		let response: Response;
		try {
			response = await window.fetch(`${baseUrl}/api/tags`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { valid: false, error: `连接失败：${message}` };
		}

		if (response.ok) {
			return { valid: true };
		}

		const errorBody = await safeReadText(response);

		if (response.status === 401 || response.status === 403) {
			return { valid: false, error: errorBody || `身份验证失败（${response.status}）` };
		}

		return { valid: false, error: errorBody || `请求失败，状态码 ${response.status}` };
	},

	discoverModels: async (auth: AuthObject): Promise<string[]> => {
		if (!auth.baseUrl?.trim()) {
			throw new Error("Ollama server URL is required");
		}

		const baseUrl = sanitizeBaseUrl(auth.baseUrl);

		const response = await window.fetch(`${baseUrl}/api/tags`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			const errorBody = await safeReadText(response);
			throw new Error(`Model discovery failed: ${errorBody || response.statusText}`);
		}

		const payload = (await response.json()) as OllamaTagsResponse;
		const models = Array.isArray(payload.models) ? payload.models : [];

		const modelNames = models
			.map((m) => m.name)
			.filter((name): name is string => typeof name === "string" && name.trim() !== "");

		// Fetch and cache model metadata in the background
		// This populates the cache for the modal without blocking
		fetchOllamaModelsInfo(baseUrl, modelNames).catch((err) => {
			Logger.warn("Failed to fetch Ollama model metadata:", err);
		});

		return modelNames;
	},
};
