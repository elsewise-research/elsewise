'use client';
import React, { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
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
import "./styles/dialog.css";

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
      <div className="workspace-setup">
        <div className="dialog workspace-setup-dialog">
          <h1 className="workspace-setup-headline">
            <a href="https://elsewise-agent-builder.vercel.app/" target="_blank" rel="noopener noreferrer">Start with building your agent {">>"}</a>
          </h1>
          <p className="workspace-setup-subtitle">Or set up a workspace directly:</p>
          <table className="workspace-setup-options">
            <tbody>
              <tr>
                <td className="workspace-setup-option">
                  <p>New Workspace from Trajectories</p>
                </td>
                <td className="workspace-setup-option">
                  <p>Restore Existing Workspace</p>
                </td>
              </tr>
              <tr>
                <td className="workspace-setup-option">
                  <div className="workspace-setup-upload-row">
                    <input type="file" accept="application/json" onChange={handleTrajectoriesFileChange} />
                    <button
                      type="submit"
                      className="workspace-setup-upload-button"
                      onClick={handleUploadTrajectories}
                      disabled={!trajectoryFile || loading}
                      title={loading ? "Uploading..." : "Upload"}
                      aria-label={loading ? "Uploading" : "Upload"}
                    >
                      {loading ? <Loader2 size={16} className="workspace-setup-spin" /> : <Upload size={16} />}
                    </button>
                  </div>
                </td>
                <td className="workspace-setup-option">
                  <div className="workspace-setup-upload-row">
                    <input type="file" accept="application/json" onChange={handleWorkspaceFileChange} />
                    <button
                      type="submit"
                      className="workspace-setup-upload-button"
                      onClick={handleUploadWorkspace}
                      disabled={!workspaceFile || loading}
                      title={loading ? "Uploading..." : "Upload"}
                      aria-label={loading ? "Uploading" : "Upload"}
                    >
                      {loading ? <Loader2 size={16} className="workspace-setup-spin" /> : <Upload size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          {error && <p className="dialog-error">{error}</p>}
        </div>
      </div>
    );
}

export default WorkspaceSetupView;
