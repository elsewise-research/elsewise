'use client';
import { useEffect, useState } from "react";
import { ReactFlow, ReactFlowProvider, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Workspace } from "@/models/Workspace";
import { loadWorkspace, saveWorkspace } from "@/utils/workspaceStorage";
import { callApi } from "@/app/apis/api";
import { ExtractDimensionInputType, ExtractDimensionOutputType, DimensionValueClusterInputType, DimensionValueClusterOutputType } from "@/app/apis/types";
import SimpleBSV from "@/components/SimpleBSV";
import styles from "./editor.module.css";

const nodeTypes = { simpleBSV: SimpleBSV };

export default function Home() {
    return (
      <ReactFlowProvider>
        <Editor />
      </ReactFlowProvider>
    );
}

function Editor() {
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

    const trajectoryColorSetting: Record<string, string> = Object.fromEntries(
      Object.entries(workspace?.settings?.trajectoryColors ?? {}).map(([trajectoryId, { color }]) => [trajectoryId, color]),
    );

    const nodes: Node[] = (workspace?.valueClusterings ?? [])
      .filter((valueClustering) => valueClustering.dimensionIds.length === 1)
      .map((valueClustering, index) => {
        const dimensionId = valueClustering.dimensionIds[0];
        const savedPosition = workspace?.settings?.nodePosition?.[dimensionId];

        return {
          id: dimensionId,
          type: "simpleBSV",
          position: savedPosition ?? { x: index * 320, y: 0 },
          data: {
            trajectories: workspace?.trajectories ?? [],
            valueClustering,
            trajectoryColorSetting,
          },
        };
      });

    return (
      <>
        <div>
          <div>
            <button onClick={() => {handleExtractDimension()}}>extract a dimension</button>
            <button onClick={() => {handleDimensionValueCluster()}}>cluster dimension values</button>
            <button onClick={() => {handleDownloadWorkspace()}}>download current workspace</button>
          </div>
          <pre>{JSON.stringify(workspace, null, 2)}</pre>
          <div className={styles.canvas}>
            <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} />
          </div>
        </div>
      </>
    );
  }
