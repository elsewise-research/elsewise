import { LLMCredentials } from "@/app/apis/LLM";

const STORAGE_KEY = "elsewise.llmCredentials";

export function loadLLMCredentials(): LLMCredentials | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as LLMCredentials) : null;
    } catch {
        return null;
    }
}

export function saveLLMCredentials(credentials: LLMCredentials): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    } catch {
        // Ignore (e.g. private-browsing storage restrictions) — the credentials still
        // work for this request, just won't be remembered next visit.
    }
}

export function clearLLMCredentials(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Ignore, see saveLLMCredentials.
    }
}
