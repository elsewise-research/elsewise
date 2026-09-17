'use client';
import React, { useState } from "react";
import { Workspace } from "@/models/Workspace";
import { saveWorkspace } from "@/utils/workspaceStorage";

function WorkspaceSetupView({}) {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFile(e.target.files?.[0] ?? null);
        setError("");
      };
    
    const handleUpload = async () => {
        if (!file) {
          setError("Please select a file.");
          return;
        }
        setLoading(true);
        setError("");
        try {
          const text = await file.text();
          const json = JSON.parse(text);

          const workspace: Workspace = {
            trajectories: json.trajectories,
          };

          saveWorkspace(workspace);

          // Nevigate to main editor view now that the workspace is persisted
          window.location.href = "/editor";

        } catch (err) {
          setError("Error: " + (err instanceof Error ? err.message : String(err)));
        }
        setLoading(false);
    };

    return (
      <div>
        <input type="file" accept="application/json" onChange={handleFileChange} />
        <button onClick={handleUpload} disabled={!file || loading}>
          {loading ? "Uploading..." : "Upload"}
        </button>
        {error && <p>{error}</p>}
      </div>
    );
}

export default WorkspaceSetupView;