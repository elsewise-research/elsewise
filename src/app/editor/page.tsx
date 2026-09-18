'use client';
import { useEffect, useState } from "react";
import { Workspace } from "@/models/Workspace";
import { loadWorkspace, saveWorkspace } from "@/utils/workspaceStorage";
import { callApi } from "@/app/apis/api";
import { ExtractDimensionInputType, ExtractDimensionOutputType } from "@/app/apis/types";

export default function Home() {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);

    const handleExtractDimension = async () => {
      if (!workspace?.trajectories) return;

      const result = await callApi<ExtractDimensionInputType, ExtractDimensionOutputType>(
        "/apis/ExtractDimension",
        { trajectories: workspace.trajectories },
      );

      const updatedWorkspace: Workspace = { ...workspace, dimensions: result.dimensions };
      setWorkspace(updatedWorkspace);
      saveWorkspace(updatedWorkspace);
    };

    useEffect(() => {
      setWorkspace(loadWorkspace());
    }, []);

    return (
      <>
        <div>
          <div>
            <button onClick={() => {handleExtractDimension()}}>extract a dimension</button>
          </div>
          <pre>{JSON.stringify(workspace, null, 2)}</pre>
        </div>
      </>
    );
  }
