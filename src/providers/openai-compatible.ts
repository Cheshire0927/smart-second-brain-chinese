/**
 * OpenAI-Compatible Provider Factory
 *
 * Creates provider definitions for configurable providers that use
 * OpenAI-compatible API endpoints.
 */

import { requestUrl } from "obsidian";
import {
	createBufferedTransportedChatOpenAI,
	createTransportedChatOpenAI,
	createTransportedOpenAIEmbeddings,
} from "./chatProviders";
import OpenAILogo from "../components/ui/logos/OpenAILogo.svelte";
import type {
	AuthObject,
	AuthValidationResult,
	BaseProviderDefinition,
	ChatModelConfig,
	EmbeddingProviderDefinition,
	ProviderSetupInstructions,
} from "../types/provider/index";

function sanitizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

interface OpenAIModelEntry {
	id?: string;
	/** Some servers set type="embedding" on embedding models */
	type?: string;
	/** Alternate field name used by some servers */
	object?: string;
}

interface OpenAIModelResponse {
	data?: Array<OpenAIModelEntry>;
}

function isEmbeddingEntry(entry: OpenAIModelEntry): boolean {
	return entry.type === "embedding" || entry.object === "embedding";
}

async function fetchModelEntries(
	auth: AuthObject,
	providerId: string,
	defaultBaseUrl: string,
): Promise<OpenAIModelEntry[]> {
	const apiUrl = `${sanitizeBaseUrl(auth.baseUrl || defaultBaseUrl)}/v1`;
	const headers: Record<string, string> = { "Content-Type": "application/json" };

	if (auth.apiKey) {
		headers.Authorization = `Bearer ${auth.apiKey}`;
	}
	if (auth.headers) {
		Object.assign(headers, auth.headers);
	}

	const response = await requestUrl({ url: `${apiUrl}/models`, method: "GET", headers, throw: false });

	if (response.status < 200 || response.status >= 300) {
		throw new Error(`${providerId} 模型发现失败：${response.text || `状态码 ${response.status}`}`);
	}

	const payload = response.json as OpenAIModelResponse;
	return Array.isArray(payload.data) ? payload.data : [];
}

export interface OpenAICompatibleProviderInput {
	id: string;
	displayName: string;
	defaultBaseUrl?: string;
	logo?: typeof OpenAILogo;
	setupInstructions?: ProviderSetupInstructions;
}

export function createOpenAICompatibleProvider(
	config: OpenAICompatibleProviderInput,
): BaseProviderDefinition | EmbeddingProviderDefinition {
	const defaultBaseUrl = sanitizeBaseUrl(config.defaultBaseUrl ?? "https://api.openai.com");
	const baseDefinition: BaseProviderDefinition = {
		id: config.id,
		displayName: config.displayName,
		logo: config.logo,
		setupInstructions: config.setupInstructions ?? {
			steps: [
				"填写 OpenAI 兼容 API 端点的基础 URL",
				"如果端点需要身份验证，请提供 API 密钥",
				"可按需添加自定义请求头用于身份验证或路由",
			],
		},
		auth: {
			baseUrl: {
				label: "基础 URL",
				description: "OpenAI 兼容 API 端点的基础 URL",
				kind: "text",
				required: true,
				placeholder: "https://your-endpoint.example/v1",
			},
			apiKey: {
				label: "API 密钥",
				description: "用于身份验证的 API 密钥（若端点不需要则留空）",
				kind: "secret",
				required: true,
				placeholder: "sk-...",
			},
			headers: {
				label: "自定义请求头",
				description: "以 JSON 填写的附加请求头（可选）",
				kind: "textarea",
				required: false,
				placeholder: '{"X-Custom-Header": "value"}',
			},
		},
		createChatInstance: (auth: AuthObject, modelId: string, options?: Partial<ChatModelConfig>) => {
			const resolvedBaseUrl = sanitizeBaseUrl(auth.baseUrl || defaultBaseUrl);
			const configuration: Record<string, unknown> = {
				baseURL: `${resolvedBaseUrl}/v1`,
			};

			if (auth.headers && Object.keys(auth.headers).length > 0) {
				configuration.defaultHeaders = auth.headers;
			}

			const chatConfig: Record<string, unknown> = {
				model: modelId,
				apiKey: auth.apiKey || "not-required",
				configuration,
			};

			if (options?.temperature !== undefined) {
				chatConfig.temperature = options.temperature;
			}

			return createTransportedChatOpenAI(config.id, chatConfig);
		},
		createSubAgentChatInstance: (auth: AuthObject, modelId: string, options?: Partial<ChatModelConfig>) => {
			const resolvedBaseUrl = sanitizeBaseUrl(auth.baseUrl || defaultBaseUrl);
			const configuration: Record<string, unknown> = { baseURL: `${resolvedBaseUrl}/v1` };
			if (auth.headers && Object.keys(auth.headers).length > 0) {
				configuration.defaultHeaders = auth.headers;
			}
			const chatConfig: Record<string, unknown> = {
				model: modelId,
				apiKey: auth.apiKey || "not-required",
				configuration,
			};
			if (options?.temperature !== undefined) {
				chatConfig.temperature = options.temperature;
			}
			return createBufferedTransportedChatOpenAI(config.id, chatConfig);
		},
		validateAuth: async (auth: AuthObject): Promise<AuthValidationResult> => {
			const apiUrl = `${sanitizeBaseUrl(auth.baseUrl || defaultBaseUrl)}/v1`;

			try {
				const headers: Record<string, string> = {
					"Content-Type": "application/json",
				};

				if (auth.apiKey) {
					headers.Authorization = `Bearer ${auth.apiKey}`;
				}

				if (auth.headers) {
					Object.assign(headers, auth.headers);
				}

				const response = await requestUrl({
					url: `${apiUrl}/models`,
					method: "GET",
					headers,
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

				return {
					valid: false,
					error: errorMessage || `请求失败，状态码 ${response.status}`,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { valid: false, error: `连接失败：${message}` };
			}
		},
		discoverModels: async (auth: AuthObject): Promise<string[]> => {
			const entries = await fetchModelEntries(auth, config.id, defaultBaseUrl);
			return entries.filter((r) => r.id && !isEmbeddingEntry(r)).map((r) => r.id as string);
		},
	};

	return {
		...baseDefinition,
		createEmbeddingInstance: (auth: AuthObject, modelId: string) => {
			const resolvedBaseUrl = sanitizeBaseUrl(auth.baseUrl || defaultBaseUrl);
			const configuration: Record<string, unknown> = {
				baseURL: `${resolvedBaseUrl}/v1`,
			};

			if (auth.headers && Object.keys(auth.headers).length > 0) {
				configuration.defaultHeaders = auth.headers;
			}

			const embeddingConfig: Record<string, unknown> = {
				model: modelId,
				apiKey: auth.apiKey || "not-required",
				encodingFormat: "float",
				configuration,
			};

			return createTransportedOpenAIEmbeddings(embeddingConfig);
		},
		discoverEmbeddingModels: async (auth: AuthObject): Promise<string[]> => {
			const entries = await fetchModelEntries(auth, config.id, defaultBaseUrl);
			return entries.filter((r) => r.id && isEmbeddingEntry(r)).map((r) => r.id as string);
		},
	} satisfies EmbeddingProviderDefinition;
}
