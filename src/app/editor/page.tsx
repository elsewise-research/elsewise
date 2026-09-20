'use client';
import { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import { ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Download, Info } from "lucide-react";
import { Workspace } from "@/models/Workspace";
import { ValueClustering, TrajectoryMoment, DIMENSION_VALUE_SEPARATOR } from "@/models/ValueClustering";
import { loadWorkspace, saveWorkspace } from "@/utils/workspaceStorage";
import { callApi } from "@/app/apis/api";
import { ExtractDimensionInputType, ExtractDimensionOutputType, DimensionValueClusterInputType, DimensionValueClusterOutputType } from "@/app/apis/types";
import SimpleBSV from "@/components/SimpleBSV";
import icon from "@/app/icon.png";
import styles from "./editor.module.css";

const nodeTypes = { simpleBSV: SimpleBSV };

export default function Home() {
    return (
      <ReactFlowProvider>
        <Editor />
      </ReactFlowProvider>
    );
}

type BSVNodeData = { valueClustering: ValueClustering };

const momentKey = (moment: TrajectoryMoment) => `${moment.trajectoryId}::${moment.turnId}`;

// Crosses two ValueClusterings (each covering one or more dimensions) into one ValueClustering
// spanning both sets of dimensions: each entry pairs a value combination from A with one from B,
// mapped to the trajectory moments that fall under both (i.e. the same moment appears in both
// source value combination's moment lists). Composite keys are joined with DIMENSION_VALUE_SEPARATOR,
// so crossing an already-composite key with another preserves the "value1_value2_value3" convention.
function crossValueClusterings(vcA: ValueClustering, vcB: ValueClustering): ValueClustering {
    const valueMapping: Record<string, TrajectoryMoment[]> = {};

    for (const [valueA, momentsA] of Object.entries(vcA.valueMapping)) {
        const keysA = new Set(momentsA.map(momentKey));
        for (const [valueB, momentsB] of Object.entries(vcB.valueMapping)) {
            const intersection = momentsB.filter((moment) => keysA.has(momentKey(moment)));
            if (intersection.length > 0) {
                valueMapping[`${valueA}${DIMENSION_VALUE_SEPARATOR}${valueB}`] = intersection;
            }
        }
    }

    return { dimensionIds: [...vcA.dimensionIds, ...vcB.dimensionIds], valueMapping };
}

function Editor() {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const reactFlowWrapper = useRef(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const { getIntersectingNodes } = useReactFlow();

    const trajectoryColors = workspace?.settings?.trajectoryColors;
    const trajectoryColorSetting: Record<string, string> = useMemo(
      () => Object.fromEntries(
        Object.entries(trajectoryColors ?? {}).map(([trajectoryId, { color }]) => [trajectoryId, color]),
      ),
      [trajectoryColors],
    );

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

    const handleToggleCompactView = (dimensionId: string) => {
      setWorkspace((prev) => {
        if (!prev) return prev;

        const currentlyEnabled = prev.settings?.compactView?.[dimensionId]?.enabled ?? false;
        const compactView = {
          ...prev.settings?.compactView,
          [dimensionId]: { enabled: !currentlyEnabled },
        };

        const updatedWorkspace: Workspace = {
          ...prev,
          settings: { ...prev.settings, compactView },
        };
        saveWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    const handleNodeDrag = (_event: MouseEvent | TouchEvent, node: Node) => {
      if (node.type !== "simpleBSV") {
        setDropTargetId(null);
        return;
      }

      const target = getIntersectingNodes(node).find((n) => n.type === "simpleBSV" && n.id !== node.id);
      setDropTargetId(target?.id ?? null);
    };

    const handleNodeDragStop = (_event: MouseEvent | TouchEvent, node: Node) => {
      setDropTargetId(null);

      if (node.type !== "simpleBSV") return;

      const target = getIntersectingNodes(node).find((n) => n.type === "simpleBSV" && n.id !== node.id);
      if (!target) return;

      setWorkspace((prev) => {
        if (!prev) return prev;

        const vcA = (node.data as BSVNodeData).valueClustering;
        const vcB = (target.data as BSVNodeData).valueClustering;
        if (!vcA?.dimensionIds.length || !vcB?.dimensionIds.length) return prev;

        const overlapsExistingDimension = vcA.dimensionIds.some((id) => vcB.dimensionIds.includes(id));
        if (overlapsExistingDimension) return prev;

        const crossed = crossValueClusterings(vcA, vcB);
        const combinedKey = [...crossed.dimensionIds].sort().join("|");
        const existingIndex = (prev.valueClusterings ?? []).findIndex(
          (vc) => vc.dimensionIds.length === crossed.dimensionIds.length
            && [...vc.dimensionIds].sort().join("|") === combinedKey,
        );

        const valueClusterings = [...(prev.valueClusterings ?? [])];
        if (existingIndex >= 0) {
          valueClusterings[existingIndex] = crossed;
        } else {
          valueClusterings.push(crossed);
        }

        const updatedWorkspace: Workspace = { ...prev, valueClusterings };
        saveWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    const handleNodesChange = (changes: NodeChange[]) => {
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));

      const finalPositionChanges = changes.filter(
        (change) => change.type === "position" && change.position && change.dragging === false,
      );
      if (finalPositionChanges.length === 0) return;

      setWorkspace((prev) => {
        if (!prev) return prev;

        const nodePosition = { ...prev.settings?.nodePosition };
        for (const change of finalPositionChanges) {
          if (change.type === "position" && change.position) {
            nodePosition[change.id] = change.position;
          }
        }

        const updatedWorkspace: Workspace = {
          ...prev,
          settings: { ...prev.settings, nodePosition },
        };
        saveWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    useEffect(() => {
      setWorkspace(loadWorkspace());
    }, []);

    useEffect(() => {
      setNodes(
        (workspace?.valueClusterings ?? [])
          .filter((valueClustering) => valueClustering.dimensionIds.length === 1)
          .map((valueClustering, index) => {
            const dimensionId = valueClustering.dimensionIds[0];
            const savedPosition = workspace?.settings?.nodePosition?.[dimensionId];
            const dimension = workspace?.dimensions?.find((dimension) => dimension.id === dimensionId);

            return {
              id: dimensionId,
              type: "simpleBSV",
              position: savedPosition ?? { x: index * 400, y: 0 },
              data: {
                dimensionName: dimension?.name ?? dimensionId,
                dimensionDescription: dimension?.description ?? "",
                trajectories: workspace?.trajectories ?? [],
                valueClustering,
                trajectoryColorSetting,
                compactView: workspace?.settings?.compactView?.[dimensionId]?.enabled ?? true,
                onToggleCompactView: () => handleToggleCompactView(dimensionId),
              },
            };
          }),
      );
    }, [workspace, trajectoryColorSetting]);

    useEffect(() => {
      setNodes((current) =>
        current.map((n) =>
          Boolean(n.data.isDropTarget) === (n.id === dropTargetId)
            ? n
            : { ...n, data: { ...n.data, isDropTarget: n.id === dropTargetId } },
        ),
      );
    }, [dropTargetId]);

    return (
      <>
        <div className={styles["root"]} ref={reactFlowWrapper}>
        <div className={styles["header"]} >
          <Image src={icon} alt="" className={styles["logo"]} />
          <h1>ELSEWISE</h1>
          <div className={styles["header-toolbar"]}>
          <button onClick={() => {handleDownloadWorkspace()}} title="download current workspace" aria-label="download current workspace">
            <Download size={16} />
          </button>
          <button onClick={() => {window.open("https://elsewise-research.github.io", "_blank", "noopener,noreferrer")}} title="about us" aria-label="about us">
            <Info size={16} />
          </button>
          
          </div>
        </div>
        <div>
            <button onClick={() => {handleExtractDimension()}}>extract a dimension</button>
            <button onClick={() => {handleDimensionValueCluster()}}>cluster dimension values</button>
          </div>
          <div className={styles.canvas}>
            <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={handleNodesChange} onNodeDrag={handleNodeDrag} onNodeDragStop={handleNodeDragStop} />
          </div>
          <pre>{JSON.stringify(workspace, null, 2)}</pre>
        </div>
      </>
    );
  }
