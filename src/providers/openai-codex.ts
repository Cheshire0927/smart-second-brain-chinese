import OpenAILogo from "../components/ui/logos/OpenAILogo.svelte";
import { createTransportedChatOpenAIResponses } from "./chatProviders";
import type {
	AuthObject,
	AuthValidationResult,
	BaseProviderDefinition,
	ChatModelConfig,
} from "../types/provider/index";
import {
	cancelOpenAICodexSignIn,
	clearOpenAICodexSession,
	createOpenAICodexFetch,
	getValidOpenAICodexSession,
	signInWithOpenAICodex,
} from "./openaiCodex";
import { getCodexSession } from "../stores/providerRuntime.svelte";
import { fetchOpenRouterModels, isEmbeddingModel, type OpenRouterModelInfo } from "./openrouterModels";

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

function isCodexDiscoverableOpenAIModel(model: OpenRouterModelInfo): boolean {
	if (!model.id.startsWith("openai/")) {
		return false;
	}

	if (isEmbeddingModel(model)) {
		return false;
	}

	const modelId = model.id.slice("openai/".length).toLowerCase();
	if (!modelId || modelId.includes(":")) {
		return false;
	}

	const outputModalities = model.architecture?.output_modalities ?? [];
	if (outputModalities.length > 0 && !outputModalities.includes("text")) {
		return false;
	}

	return !(
		modelId.includes("audio") ||
		modelId.includes("image") ||
		modelId.includes("deep-research") ||
		modelId.includes("safeguard")
	);
}

export function openAICodexProvider(providerId: string, displayName = "OpenAI Codex"): BaseProviderDefinition {
	return {
		id: providerId,
		displayName,
		logo: OpenAILogo,
		setupInstructions: {
			steps: [
				"使用 ChatGPT/Codex 登录来授权此服务商",
				"完成基于浏览器的登录流程",
				"选择一个已发现的 Codex 聊天模型",
			],
		},
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
			supportsApiKey: false,
		},
		auth: {
			apiKey: {
				label: "ChatGPT 登录",
				description: "此服务商使用基于浏览器的 ChatGPT/Codex 登录流程。",
				kind: "text",
				required: true,
				placeholder: "通过 ChatGPT 登录授权",
			},
		},
		createChatInstance: (_auth: AuthObject, modelId: string, options?: Partial<ChatModelConfig>) =>
			createTransportedChatOpenAIResponses(providerId, {
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
			}),
		validateAuth: async (_auth: AuthObject): Promise<AuthValidationResult> => {
			const session = await getValidOpenAICodexSession();
			if (!session) {
				return { valid: false, error: "请登录 ChatGPT 以使用 Codex" };
			}
			return { valid: true };
		},
		discoverModels: async (): Promise<string[]> => {
			const models = await fetchOpenRouterModels();
			if (!models) {
				return [];
			}

			return Array.from(
				new Set(
					Array.from(models.values())
						.filter(isCodexDiscoverableOpenAIModel)
						.map((model) => model.id.split("/").pop()?.trim())
						.filter((modelId): modelId is string => Boolean(modelId)),
				),
			).sort((a, b) => a.localeCompare(b));
		},
	};
}
