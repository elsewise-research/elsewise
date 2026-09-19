'use client';
import { useEffect, useState } from "react";
import { Workspace } from "@/models/Workspace";
import { loadWorkspace, saveWorkspace } from "@/utils/workspaceStorage";
import { callApi } from "@/app/apis/api";
import { ExtractDimensionInputType, ExtractDimensionOutputType, DimensionValueClusterInputType, DimensionValueClusterOutputType } from "@/app/apis/types";

export default function Home() {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);

    const handleExtractDimension = async () => {
      if (!workspace?.trajectories) return;

      const result = await callApi<ExtractDimensionInputType, ExtractDimensionOutputType>(
        "/apis/ExtractDimension",
        { trajectories: workspace.trajectories, domainDescription: workspace.domainDescription },
      );

      const updatedWorkspace: Workspace = {
        ...workspace,
        dimensions: result.dimensions,
        valueClusterings: result.valueClusterings,
      };
      setWorkspace(updatedWorkspace);
      saveWorkspace(updatedWorkspace);
    };

    const handleDimensionValueCluster = async () => {
      if (!workspace?.trajectories || !workspace?.dimensions?.length) return;

      const result = await callApi<DimensionValueClusterInputType, DimensionValueClusterOutputType>(
        "/apis/DimensionValueCluster",
        {
          trajectories: workspace.trajectories,
          dimensions: workspace.dimensions,
          domainDescription: workspace.domainDescription,
        },
      );

      const updatedWorkspace: Workspace = { ...workspace, valueClusterings: result.valueClusterings };
      setWorkspace(updatedWorkspace);
      saveWorkspace(updatedWorkspace);
    };

    const handleDownloadWorkspace = () => {
      if (!workspace) return;

      const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      const link = document.createElement("a");
      link.href = url;
      link.download = `${workspace.title || "untitled_workspace"}_${timestamp}.json`;
      link.click();

      URL.revokeObjectURL(url);
    }

    useEffect(() => {
      setWorkspace(loadWorkspace());
    }, []);

    return (
      <>
        <div>
          <div>
            <button onClick={() => {handleExtractDimension()}}>extract a dimension</button>
            <button onClick={() => {handleDimensionValueCluster()}}>cluster dimension values</button>
            <button onClick={() => {handleDownloadWorkspace()}}>download current workspace</button>
          </div>
          <pre>{JSON.stringify(workspace, null, 2)}</pre>
        </div>
      </>
    );
  }
