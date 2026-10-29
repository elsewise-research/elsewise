'use client';
import { useState } from "react";
import { LLMCredentials, LLMProvider } from "@/app/apis/LLM";

import "../styles/dialog.css";

type Props = {
    initialCredentials: LLMCredentials | null;
    errorMessage?: string | null;
    onSave: (credentials: LLMCredentials) => void;
    onClear: () => void;
    onCancel: () => void;
};

export default function ApiKeyDialog({ initialCredentials, errorMessage, onSave, onClear, onCancel }: Props) {
    const [provider, setProvider] = useState<LLMProvider>(initialCredentials?.provider ?? "anthropic");
    const [apiKey, setApiKey] = useState(initialCredentials?.apiKey ?? "");
    const [revealed, setRevealed] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedKey = apiKey.trim();
        if (!trimmedKey) return;

        onSave({ provider, apiKey: trimmedKey });
    };

    return (
        <div className="dialog-overlay" onClick={onCancel}>
            <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
                <h2>Configure your LLM API key</h2>
                <p>
                    This workspace has no server-side API key configured. Provide your own to use dimension
                    extraction and clustering — it&apos;s stored only in this browser, and sent to our server
                    with each request solely to forward it to the provider on your behalf. It is never stored
                    or logged on the server.
                </p>
                {errorMessage && <p className="dialog-error">{errorMessage}</p>}
                <label>
                    Provider
                    <select value={provider} onChange={(e) => setProvider(e.target.value as LLMProvider)}>
                        <option value="anthropic">Anthropic</option>
                        <option value="openai">OpenAI</option>
                    </select>
                </label>
                <label>
                    API key
                    <input
                        type={revealed ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        autoFocus
                        required
                    />
                </label>
                <button type="button" onClick={() => setRevealed((prev) => !prev)}>
                    {revealed ? "Hide" : "Reveal"}
                </button>
                <div className="dialog-actions">
                    {initialCredentials && <button type="button" onClick={onClear}>Clear</button>}
                    <button type="button" onClick={onCancel}>Cancel</button>
                    <button type="submit" disabled={!apiKey.trim()}>Save</button>
                </div>
            </form>
        </div>
    );
}
