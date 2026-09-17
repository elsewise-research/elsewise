'use client';
import { useEffect, useState } from "react";
import { Workspace } from "@/models/Workspace";
import { loadWorkspace } from "@/utils/workspaceStorage";

export default function Home() {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);

    useEffect(() => {
      setWorkspace(loadWorkspace());
    }, []);

    return (
      <>
        <div>
          <pre>{JSON.stringify(workspace, null, 2)}</pre>
        </div>
      </>
    );
  }
