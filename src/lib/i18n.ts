import { getLanguage } from "obsidian";
import { addMessages, init } from "svelte-i18n";

import en from "./en.json";
import zh from "./zh.json";

addMessages("en", en);
addMessages("zh", zh);

// Obsidian reports Chinese as "zh", "zh-cn", "zh-TW", etc. Any Chinese variant
// uses the Simplified Chinese bundle; everything else falls back to English.
const language = getLanguage().toLowerCase();
const initialLocale = language.startsWith("zh") ? "zh" : "en";

void init({
	fallbackLocale: "en",
	initialLocale,
});
