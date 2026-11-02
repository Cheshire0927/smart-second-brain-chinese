/**
 * Provider Registry
 *
 * This module provides lookup helpers for code-defined provider templates and
 * persisted provider instances created from those templates.
 */

import type { BaseProviderDefinition, ProviderInstanceMeta, ProviderTemplateId } from "../types/provider/index";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import { anthropicProvider } from "./anthropic";
import { ollamaProvider } from "./ollama";
import { openaiProvider } from "./openai";
import { openrouterProvider } from "./openrouter";
import { openAICodexProvider } from "./openai-codex";
import { createOmlxProvider } from "./omlx";

export interface ProviderTemplateDefinition {
	id: ProviderTemplateId;
	displayName: string;
	description: string;
}

const PROVIDER_TEMPLATES: readonly ProviderTemplateDefinition[] = [
	{
		id: "openai",
		displayName: "OpenAI",
		description: "通过 ChatGPT 登录或 API 密钥使用 OpenAI 模型。",
	},
	{
		id: "openai-compatible",
		displayName: "自定义",
		description: "灵活的 OpenAI 风格服务商，可用于 OpenAI 及兼容端点。",
	},
	{
		id: "anthropic",
		displayName: "Anthropic",
		description: "通过 Anthropic API 使用 Claude 模型。",
	},
	{
		id: "ollama",
		displayName: "Ollama",
		description: "通过 Ollama API 使用本地 Ollama 模型。",
	},
	{
		id: "omlx",
		displayName: "oMLX",
		description: "通过 oMLX 的 OpenAI 兼容服务在 Mac 上使用本地 MLX 模型。",
	},
	{
		id: "openrouter",
		displayName: "OpenRouter",
		description: "OpenRouter 账户与模型目录。",
	},
] as const;

export function getProviderTemplate(templateId: ProviderTemplateId): ProviderTemplateDefinition | undefined {
	return PROVIDER_TEMPLATES.find((template) => template.id === templateId);
}

function createTemplateDefinition(
	instanceId: string,
	templateId: ProviderTemplateId,
	meta: ProviderInstanceMeta,
): BaseProviderDefinition | undefined {
	switch (templateId) {
		case "openai":
			return {
				...openaiProvider,
				id: instanceId,
				displayName: meta.displayName,
			};
		case "openai-compatible":
			return createOpenAICompatibleProvider({
				id: instanceId,
				displayName: meta.displayName,
				defaultBaseUrl: "https://api.openai.com",
			});
		case "omlx":
			return createOmlxProvider(instanceId, meta.displayName);
		case "openai-codex":
			return openAICodexProvider(instanceId, meta.displayName);
		case "anthropic":
			return {
				...anthropicProvider,
				id: instanceId,
				displayName: meta.displayName,
			};
		case "ollama":
			return {
				...ollamaProvider,
				id: instanceId,
				displayName: meta.displayName,
			};
		case "openrouter":
			return {
				...openrouterProvider,
				id: instanceId,
				displayName: meta.displayName,
			};
		default:
			return undefined;
	}
}

export function getProviderDefinition(
	id: string,
	providerMeta: Record<string, ProviderInstanceMeta> = {},
): BaseProviderDefinition | undefined {
	switch (id) {
		case "openai":
			return openaiProvider;
		case "anthropic":
			return anthropicProvider;
		case "ollama":
			return ollamaProvider;
	}

	const meta = providerMeta[id];
	if (!meta) {
		return undefined;
	}

	return createTemplateDefinition(id, meta.templateId, meta);
}

export function getAllProviderTemplates(): readonly ProviderTemplateDefinition[] {
	return PROVIDER_TEMPLATES;
}

export {
	ProviderRegistryError,
	ProviderAuthError,
	ProviderEndpointError,
	ModelNotFoundError,
	ProviderNotFoundError,
} from "./errors";

export { createOpenAICompatibleProvider } from "./openai-compatible";

export type {
	AuthObject,
	AuthFieldDefinition,
	BaseProviderDefinition,
	ChatModelConfig,
	EmbedModelConfig,
	LogoProps,
	OpenAIAuthMode,
	ProviderInstanceMeta,
	ProviderTemplateId,
} from "../types/provider/index";

export { isEmbeddingProvider } from "../types/provider/index";

export { anthropicProvider } from "./anthropic";
export { openaiProvider } from "./openai";
export { ollamaProvider } from "./ollama";
