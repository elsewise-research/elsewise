'use client';
import React, { useState } from "react";
import { Workspace } from "@/models/Workspace";
import { callApi } from "@/app/apis/api";
import { CreateWorkspaceInputType, CreateWorkspaceOutputType } from "@/app/apis/types";
import { ensureTrajectoryColors, processTrajectoriesText } from "@/utils/trajectory";

function WorkspaceSetupView({}) {
    const [trajectoryFile, setTrajectoryFile] = useState<File | null>(null);
    const [workspaceFile, setWorkspaceFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const createWorkspaceAndNavigate = async (workspace: Workspace) => {
        const { id } = await callApi<CreateWorkspaceInputType, CreateWorkspaceOutputType>(
          "/apis/Workspace",
          { workspace },
        );
        window.location.href = `/editor/${id}`;
    };

    const handleTrajectoriesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTrajectoryFile(e.target.files?.[0] ?? null);
        setError("");
      };

    const handleUploadTrajectories = async () => {
        if (!trajectoryFile) {
          setError("Please select a file.");
          return;
        }
        setLoading(true);
        setError("");
        try {
          const text = await trajectoryFile.text();
          const { trajectories } = processTrajectoriesText(text);

          const workspace: Workspace = ensureTrajectoryColors({
            trajectories,
          });

          await createWorkspaceAndNavigate(workspace);

        } catch (err) {
          setError("Error: " + (err instanceof Error ? err.message : String(err)));
        }
        setLoading(false);
    };

    const handleWorkspaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setWorkspaceFile(e.target.files?.[0] ?? null);
        setError("");
      };

    const handleUploadWorkspace = async () => {
        if (!workspaceFile) {
          setError("Please select a file.");
          return;
        }
        setLoading(true);
        setError("");
        try {
          const text = await workspaceFile.text();
          const workspace: Workspace = ensureTrajectoryColors(JSON.parse(text));

          await createWorkspaceAndNavigate(workspace);

        } catch (err) {
          setError("Error: " + (err instanceof Error ? err.message : String(err)));
        }
        setLoading(false);
    };

    return (
      <>
        <div>
          <h1>Create New Workspace from Trajectories</h1>
          <input type="file" accept="application/json" onChange={handleTrajectoriesFileChange} />
          <button onClick={handleUploadTrajectories} disabled={!trajectoryFile || loading}>
            {loading ? "Uploading..." : "Upload"}
          </button>
        </div>
        <div>
          <h1>Restore Existing Workspace</h1>
          <input type="file" accept="application/json" onChange={handleWorkspaceFileChange} />
          <button onClick={handleUploadWorkspace} disabled={!workspaceFile || loading}>
            {loading ? "Uploading..." : "Upload"}
          </button>
        </div>
        <div> {error && <p>{error}</p>}</div>
      </>
    );
}

export default WorkspaceSetupView;
