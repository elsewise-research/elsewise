'use client';
import { useState } from "react";

import "../styles/dialog.css";

type Props = {
    workspaceId: string;
    ingestionToken: string;
    onCancel: () => void;
};

export default function IngestionCredentialDialog({ workspaceId, ingestionToken, onCancel }: Props) {
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState<"endpoint" | "token" | null>(null);

    const endpoint = typeof window !== "undefined"
        ? `${window.location.origin}/apis/Workspace/${workspaceId}/Trajectories`
        : `/apis/Workspace/${workspaceId}/Trajectories`;

    const handleCopy = async (value: string, which: "endpoint" | "token") => {
        await navigator.clipboard.writeText(value);
        setCopied(which);
        setTimeout(() => setCopied(null), 1500);
    };

    return (
        <div className="dialog-overlay" onClick={onCancel}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <h2>Ingest external trajectories</h2>
                <label>
                    Endpoint
                    <input type="text" value={endpoint} readOnly onFocus={(e) => e.target.select()} />
                </label>
                <button type="button" onClick={() => handleCopy(endpoint, "endpoint")}>
                    {copied === "endpoint" ? "Copied" : "Copy endpoint"}
                </button>
                <label>
                    Token
                    <input
                        type={revealed ? "text" : "password"}
                        value={ingestionToken}
                        readOnly
                        onFocus={(e) => e.target.select()}
                    />
                </label>
                <button type="button" onClick={() => setRevealed((prev) => !prev)}>
                    {revealed ? "Hide" : "Reveal"}
                </button>
                <button type="button" onClick={() => handleCopy(ingestionToken, "token")}>
                    {copied === "token" ? "Copied" : "Copy token"}
                </button>
                <p>
                    POST a JSON body of <code>{"{ trajectories: [...] }"}</code> to the endpoint above with header{" "}
                    <code>Authorization: Bearer &lt;token&gt;</code>. Works for one trajectory per call or many at once.
                </p>
                <div className="dialog-actions">
                    <button type="button" onClick={onCancel}>Close</button>
                </div>
            </div>
        </div>
    );
}
