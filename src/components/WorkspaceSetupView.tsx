'use client';
import React, { useState } from "react";
import { Workspace } from "@/models/Workspace";
import { Trajectory } from "@/models/Trajectory";
import { Batch, BatchData } from "@/models/Batch";
import { callApi } from "@/app/apis/api";
import {
  CreateWorkspaceInputType,
  CreateWorkspaceOutputType,
  ReplaceBatchValueClusteringsInputType,
  ReplaceBatchValueClusteringsOutputType,
  AppendTrajectoriesOutputType,
} from "@/app/apis/types";
import { processTrajectoriesText } from "@/utils/trajectory";

// The ingestion endpoint is Bearer-token authed, which callApi doesn't support headers for,
// so this one call is made directly rather than through the shared helper.
async function pushBatch(workspaceId: string, token: string, trajectories: Trajectory[]): Promise<AppendTrajectoriesOutputType> {
  const response = await fetch(`/apis/Workspace/${workspaceId}/Trajectories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ trajectories }),
  });
  if (!response.ok) throw new Error(`Failed to push batch: ${response.status}`);
  return response.json();
}

function WorkspaceSetupView({}) {
    const [trajectoryFile, setTrajectoryFile] = useState<File | null>(null);
    const [workspaceFile, setWorkspaceFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

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

          const { id } = await callApi<CreateWorkspaceInputType, CreateWorkspaceOutputType>(
            "/apis/Workspace",
            { workspace: {}, trajectories },
          );
          window.location.href = `/editor/${id}`;

        } catch (err) {
          setError("Error: " + (err instanceof Error ? err.message : String(err)));
        }
        setLoading(false);
    };

    const handleWorkspaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setWorkspaceFile(e.target.files?.[0] ?? null);
        setError("");
      };

    // Restores a workspace previously downloaded from the editor, which bundles every
    // batch's data alongside the workspace metadata (see handleDownloadWorkspace). The first
    // batch seeds workspace creation; every later batch is replayed through the same
    // ingestion path a real push would use.
    const handleUploadWorkspace = async () => {
        if (!workspaceFile) {
          setError("Please select a file.");
          return;
        }
        setLoading(true);
        setError("");
        try {
          const text = await workspaceFile.text();
          const exported = JSON.parse(text) as {
            workspace: Workspace;
            batches: { batch: Batch; data: BatchData }[];
          };
          if (!exported.batches?.length) {
            throw new Error("Exported workspace file has no batches");
          }

          const [firstBatch, ...restBatches] = exported.batches;
          const created = await callApi<CreateWorkspaceInputType, CreateWorkspaceOutputType>(
            "/apis/Workspace",
            { workspace: exported.workspace, trajectories: firstBatch.data.trajectories },
          );

          await callApi<ReplaceBatchValueClusteringsInputType, ReplaceBatchValueClusteringsOutputType>(
            `/apis/Workspace/${created.id}/Batches/${created.batches[0].id}/ValueClusterings`,
            { valueClusterings: firstBatch.data.valueClusterings },
            "PUT",
          );

          for (const { data } of restBatches) {
            const pushed = await pushBatch(created.id, created.ingestionToken, data.trajectories);
            await callApi<ReplaceBatchValueClusteringsInputType, ReplaceBatchValueClusteringsOutputType>(
              `/apis/Workspace/${created.id}/Batches/${pushed.batch.id}/ValueClusterings`,
              { valueClusterings: data.valueClusterings },
              "PUT",
            );
          }

          window.location.href = `/editor/${created.id}`;

        } catch (err) {
          setError("Error: " + (err instanceof Error ? err.message : String(err)));
        }
        setLoading(false);
    };

    return (
      <>
        <div>
          <h1>Start by <a href="https://elsewise-agent-builder.vercel.app/">building your agent {">>"}</a></h1>
        </div>
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
