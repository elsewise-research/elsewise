'use client';
import { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Download, Info, Plug, Plus, Sparkles, Group, FilterX } from "lucide-react";
import { Workspace } from "@/models/Workspace";
import { Dimension } from "@/models/Dimension";
import { ValueClustering, TrajectoryMoment } from "@/models/ValueClustering";
import { appendDimension, crossDimensions, deleteDimension, deleteValueClustering } from "@/utils/dimension";
import { callApi, getApi } from "@/app/apis/api";
import { ExtractDimensionInputType, ExtractDimensionOutputType, DimensionValueClusterInputType, DimensionValueClusterOutputType, ExtractDimensionValuesInputType, ExtractDimensionValuesOutputType, GetWorkspaceOutputType, ReplaceWorkspaceInputType, ReplaceWorkspaceOutputType } from "@/app/apis/types";
import SimpleBSV from "@/components/SimpleBSV";
import CompositionalBSV from "@/components/CompositionalBSV";
import TrajectoryViewer  from "@/components/TrajectoryViewer";
import AddDimensionDialog, { type AddDimensionInput } from "@/components/dialogs/AddDimensionDialog";
import IngestionCredentialDialog from "@/components/dialogs/IngestionCredentialDialog";
import icon from "@/app/icon.png";
import styles from "./editor.module.css";

const nodeTypes = { simpleBSV: SimpleBSV, compositionalBSV: CompositionalBSV };

export default function Home() {
    return (
      <ReactFlowProvider>
        <Editor />
      </ReactFlowProvider>
    );
}

type BSVNodeData = { valueClustering: ValueClustering };

// Clusters trajectory moments into each dimension's values (scoped to dimensionIds if given,
// otherwise every dimension in the workspace), merging the result back in without disturbing
// any other dimension's or composite's existing clustering. Takes workspace explicitly (rather
// than reading component state) so callers can chain it onto a workspace they just updated,
// without waiting a render for that update to land in state.
async function clusterDimensionValues(workspace: Workspace, dimensionIds?: string[]): Promise<Workspace> {
    if (!workspace.trajectories || !workspace.dimensions?.length) return workspace;

    const dimensionsToCluster = dimensionIds
      ? workspace.dimensions.filter((dimension) => dimensionIds.includes(dimension.id))
      : workspace.dimensions;
    if (dimensionsToCluster.length === 0) return workspace;

    const result = await callApi<DimensionValueClusterInputType, DimensionValueClusterOutputType>(
      "/apis/DimensionValueCluster",
      {
        trajectories: workspace.trajectories,
        dimensions: dimensionsToCluster,
        domainDescription: workspace.domainDescription,
      },
    );

    // Replace only the clusterings that match a dimension set we just (re)clustered,
    // leaving every other clustering (including composites) untouched.
    const dimensionIdsKey = (ids: string[]) => [...ids].sort().join("|");
    const resultKeys = new Set(result.valueClusterings.map((vc) => dimensionIdsKey(vc.dimensionIds)));
    const preserved = (workspace.valueClusterings ?? []).filter(
      (vc) => !resultKeys.has(dimensionIdsKey(vc.dimensionIds)),
    );

    return {
      ...workspace,
      valueClusterings: [...preserved, ...result.valueClusterings],
    };
}

function Editor() {
    const { id } = useParams<{ id: string }>();
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [ingestionToken, setIngestionToken] = useState<string | null>(null);
    const [isIngestionDialogOpen, setIsIngestionDialogOpen] = useState(false);
    const reactFlowWrapper = useRef(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [isAddDimensionOpen, setIsAddDimensionOpen] = useState(false);
    const [currTrajectoryMoment, setCurrTrajectoryMoment] = useState<TrajectoryMoment | undefined>(undefined);
    const [highlightedTrajectoryMoments, setHighlightedTrajectoryMoments] = useState<TrajectoryMoment[]>([]);
    const [selectedTurnOrder, setSelectedTurnOrder] = useState<number | "all">("all");
    const { getIntersectingNodes } = useReactFlow();

    // Fire-and-forget persistence to the server-side workspace row. The server always
    // preserves the stored `trajectories` regardless of what's sent here, so an editor
    // tab with a stale in-memory snapshot can never clobber trajectories an external
    // tool pushed in the meantime.
    const persistWorkspace = (updatedWorkspace: Workspace) => {
      callApi<ReplaceWorkspaceInputType, ReplaceWorkspaceOutputType>(
        `/apis/Workspace/${id}`,
        { workspace: updatedWorkspace },
        "PUT",
      ).catch((err) => console.error("Failed to save workspace", err));
    };

    // Every turn order (1-indexed position within a trajectory) that some trajectory
    // actually has a turn at, sorted ascending.
    const turnOrders = useMemo(() => {
      const orders = new Set<number>();
      for (const trajectory of workspace?.trajectories ?? []) {
        trajectory.turns.forEach((_, index) => orders.add(index + 1));
      }
      return Array.from(orders).sort((a, b) => a - b);
    }, [workspace?.trajectories]);

    const trajectoryColors = workspace?.settings?.trajectoryColors;
    const trajectoryColorSetting: Record<string, string> = useMemo(
      () => Object.fromEntries(
        Object.entries(trajectoryColors ?? {}).map(([trajectoryId, { color }]) => [trajectoryId, color]),
      ),
      [trajectoryColors],
    );

    const handleAddDimension = () => {
      setIsAddDimensionOpen(true);
    };

    const handleSubmitAddDimension = async (input: AddDimensionInput) => {
      setIsAddDimensionOpen(false);
      if (!workspace) return;

      const id = crypto.randomUUID();
      // input.values are user-entered; pass them through as each dimension's existing
      // "values" so the LLM extracts additional ones instead of regenerating these.
      let values = input.values;

      if (workspace.trajectories?.length) {
        const result = await callApi<ExtractDimensionValuesInputType, ExtractDimensionValuesOutputType>(
          "/apis/ExtractDimensionValues",
          {
            trajectories: workspace.trajectories,
            dimensions: [{ id, name: input.name, description: input.description, values: input.values }],
            domainDescription: workspace.domainDescription,
          },
        );
        values = result.dimensions[0]?.values ?? input.values;
      }

      const dimension: Dimension = {
        id,
        name: input.name,
        description: input.description,
        values,
      };

      const updatedWorkspace = appendDimension(workspace, dimension);
      setWorkspace(updatedWorkspace);
      persistWorkspace(updatedWorkspace);
    };

    const handleExtractDimension = async () => {
      if (!workspace?.trajectories) return;

      const result = await callApi<ExtractDimensionInputType, ExtractDimensionOutputType>(
        "/apis/ExtractDimension",
        {
          trajectories: workspace.trajectories,
          domainDescription: workspace.domainDescription,
          existingDimensions: workspace.dimensions?.map(({ name, description }) => ({ name, description })),
        },
      );

      const appendedWorkspace = result.dimensions.reduce(
        (ws, dimension) => appendDimension(ws, dimension),
        workspace,
      );

      // Cluster only the dimensions we just extracted, not the whole workspace.
      const updatedWorkspace = await clusterDimensionValues(
        appendedWorkspace,
        result.dimensions.map((dimension) => dimension.id),
      );
      setWorkspace(updatedWorkspace);
      persistWorkspace(updatedWorkspace);
    };

    const handleDimensionValueCluster = async (dimensionIds?: string[]) => {
      if (!workspace) return;

      const updatedWorkspace = await clusterDimensionValues(workspace, dimensionIds);
      setWorkspace(updatedWorkspace);
      persistWorkspace(updatedWorkspace);
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
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    const handleToggleMatrixView = (dimensionIdsKey: string) => {
      setWorkspace((prev) => {
        if (!prev) return prev;

        const currentlyEnabled = prev.settings?.matrixView?.[dimensionIdsKey]?.enabled ?? false;
        const matrixView = {
          ...prev.settings?.matrixView,
          [dimensionIdsKey]: { enabled: !currentlyEnabled },
        };

        const updatedWorkspace: Workspace = {
          ...prev,
          settings: { ...prev.settings, matrixView },
        };
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    const handleDeleteDimension = (dimensionId: string) => {
      setWorkspace((prev) => {
        if (!prev) return prev;

        const updatedWorkspace = deleteDimension(prev, dimensionId);
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    const handleDeleteValueClustering = (dimensionIds: string[]) => {
      setWorkspace((prev) => {
        if (!prev) return prev;

        const updatedWorkspace = deleteValueClustering(prev, dimensionIds);
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    const handleMomentClick = (moment: TrajectoryMoment) => {
      setCurrTrajectoryMoment(moment);

      const trajectory = workspace?.trajectories?.find((trajectory) => trajectory.id === moment.trajectoryId);
      setHighlightedTrajectoryMoments(
        trajectory
          ? trajectory.turns.map((turn) => ({ trajectoryId: trajectory.id, turnId: turn.id }))
          : [],
      );
    };

    // Highlight every moment sharing the same dimension value combination as the clicked cell,
    // leaving whichever single moment (if any) was previously selected untouched.
    const handleCellClick = (moments: TrajectoryMoment[]) => {
      setHighlightedTrajectoryMoments(moments);
    };

    const handleClearHighlightedTrajectoryMoment = () => {
      setHighlightedTrajectoryMoments([]);
    };

    // Highlight, for every trajectory, whichever single moment (if any) falls at the
    // chosen turn order; "all" clears the filter back to nothing highlighted.
    const handleTurnOrderChange = (turnOrder: number | "all") => {
      setSelectedTurnOrder(turnOrder);

      if (turnOrder === "all") {
        setHighlightedTrajectoryMoments([]);
        return;
      }

      const moments: TrajectoryMoment[] = [];
      for (const trajectory of workspace?.trajectories ?? []) {
        const turn = trajectory.turns[turnOrder - 1];
        if (turn) moments.push({ trajectoryId: trajectory.id, turnId: turn.id });
      }
      setHighlightedTrajectoryMoments(moments);
    };

    const handleNodeDrag = (_event: MouseEvent | TouchEvent, node: Node) => {
      if (node.type !== "simpleBSV" && node.type !== "compositionalBSV") {
        setDropTargetId(null);
        return;
      }

      const target = getIntersectingNodes(node).find((n) => (n.type === "simpleBSV" ||  n.type === "compositionalBSV") && n.id !== node.id);
      setDropTargetId(target?.id ?? null);
    };

    const handleNodeDragStop = (_event: MouseEvent | TouchEvent, node: Node) => {
      setDropTargetId(null);

      if (node.type !== "simpleBSV" && node.type !== "compositionalBSV") return;

      const target = getIntersectingNodes(node).find((n) => (n.type === "simpleBSV" ||  n.type === "compositionalBSV") && n.id !== node.id);
      if (!target) return;

      setWorkspace((prev) => {
        if (!prev) return prev;

        const vcA = (node.data as BSVNodeData).valueClustering;
        const vcB = (target.data as BSVNodeData).valueClustering;
        if (!vcA?.dimensionIds.length || !vcB?.dimensionIds.length) return prev;

        const overlapsExistingDimension = vcA.dimensionIds.some((id) => vcB.dimensionIds.includes(id));
        if (overlapsExistingDimension) return prev;

        const valueClusterings = crossDimensions(prev.valueClusterings ?? [], vcA, vcB);

        const updatedWorkspace: Workspace = { ...prev, valueClusterings };
        persistWorkspace(updatedWorkspace);
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
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    useEffect(() => {
      if (!id) return;
      getApi<GetWorkspaceOutputType>(`/apis/Workspace/${id}`).then((result) => {
        setWorkspace(result.workspace);
        setIngestionToken(result.ingestionToken);
      });
    }, [id]);

    useEffect(() => {
      const simpleNodes = (workspace?.valueClusterings ?? [])
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
              onDelete: () => handleDeleteDimension(dimensionId),
              onValueCluster: () => handleDimensionValueCluster([dimensionId]),
              onMomentClick: handleMomentClick,
              onCellClick: handleCellClick,
              highlightedTrajectoryMoments,
            },
          };
        });

      const compositionalNodes = (workspace?.valueClusterings ?? [])
        .filter((valueClustering) => valueClustering.dimensionIds.length > 1)
        .map((valueClustering, index) => {
          const dimensionIdsKey = valueClustering.dimensionIds.join("|");
          const savedPosition = workspace?.settings?.nodePosition?.[dimensionIdsKey];
          const dimensions = valueClustering.dimensionIds.map(
            (dimensionId) => workspace?.dimensions?.find((dimension) => dimension.id === dimensionId),
          );

          return {
            id: dimensionIdsKey,
            type: "compositionalBSV",
            position: savedPosition ?? { x: index * 400, y: 500 },
            data: {
              dimensionNames: dimensions.map((dimension, i) => dimension?.name ?? valueClustering.dimensionIds[i]),
              dimensionDescriptions: dimensions.map((dimension) => dimension?.description ?? ""),
              trajectories: workspace?.trajectories ?? [],
              valueClustering,
              trajectoryColorSetting,
              matrixView: workspace?.settings?.matrixView?.[dimensionIdsKey]?.enabled ?? true,
              onToggleMatrixView: () => handleToggleMatrixView(dimensionIdsKey),
              onDelete: () => handleDeleteValueClustering(valueClustering.dimensionIds),
              onMomentClick: handleMomentClick,
              onCellClick: handleCellClick,
              highlightedTrajectoryMoments,
            },
          };
        });

      setNodes([...simpleNodes, ...compositionalNodes]);
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

    useEffect(() => {
      setNodes((current) =>
        current.map((n) => ({ ...n, data: { ...n.data, currTrajectoryMoment } })),
      );
    }, [currTrajectoryMoment]);

    useEffect(() => {
      setNodes((current) =>
        current.map((n) => ({ ...n, data: { ...n.data, highlightedTrajectoryMoments } })),
      );
    }, [highlightedTrajectoryMoments]);

    return (
      <>
        <div className={styles["root"]} ref={reactFlowWrapper}>
        <div className={styles["header"]} >
          <Image src={icon} alt="" className={styles["logo"]} />
          <h1>ELSEWISE</h1>
          <div className={styles["header-toolbar"]}>
          <button onClick={() => {setIsIngestionDialogOpen(true)}} title="push trajectories from an external tool" aria-label="push trajectories from an external tool" disabled={!ingestionToken}>
            <Plug size={16} />
          </button>
          <button onClick={() => {handleDownloadWorkspace()}} title="download current workspace" aria-label="download current workspace">
            <Download size={16} />
          </button>
          <button onClick={() => {window.open("https://elsewise-research.github.io", "_blank", "noopener,noreferrer")}} title="about us" aria-label="about us">
            <Info size={16} />
          </button>
          </div>
        </div>
          <div className={styles["action-bar"]}>
              <div className={styles["turn-order-slider"]} title="highlight trajectory moments by turn order">
                <span>{selectedTurnOrder === "all" ? "All" : `Turn ${selectedTurnOrder}`}</span>
                <input
                  type="range"
                  min={0}
                  max={turnOrders.length}
                  step={1}
                  value={selectedTurnOrder === "all" ? 0 : turnOrders.indexOf(selectedTurnOrder) + 1}
                  onChange={(e) => {
                    const sliderValue = Number(e.target.value);
                    handleTurnOrderChange(sliderValue === 0 ? "all" : turnOrders[sliderValue - 1]);
                  }}
                />
              </div>
              <button onClick={() => {handleAddDimension()}} title="add new dimension"><Plus size={16} /></button>
              <button onClick={() => {handleExtractDimension()}}title="exract dimensions from trajectories"><Sparkles size={16} /></button>
              <button onClick={() => {handleClearHighlightedTrajectoryMoment()}} title="clear highlighted trajectory moments" aria-label="clear highlighted trajectory moments">
                <FilterX size={16} />
              </button>
          </div>
          <div className={styles["trajectory-viewer"]}>
            <TrajectoryViewer
              currTrajectoryMoment={currTrajectoryMoment}
              trajectories={workspace?.trajectories ?? []}
              trajectoryColorSetting={trajectoryColorSetting}
              valueClusterings={workspace?.valueClusterings ?? []}
              dimensions={workspace?.dimensions ?? []}
              onBackToOverview={() => setCurrTrajectoryMoment(undefined)}
            />
          </div>
          <div className={styles.canvas}>
            <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={handleNodesChange} onNodeDrag={handleNodeDrag} onNodeDragStop={handleNodeDragStop} />
          </div>
          <pre>{JSON.stringify(workspace, null, 2)}</pre>
        </div>
        {isAddDimensionOpen && (
          <AddDimensionDialog
            onSubmit={handleSubmitAddDimension}
            onCancel={() => setIsAddDimensionOpen(false)}
          />
        )}
        {isIngestionDialogOpen && ingestionToken && (
          <IngestionCredentialDialog
            workspaceId={id}
            ingestionToken={ingestionToken}
            onCancel={() => setIsIngestionDialogOpen(false)}
          />
        )}
      </>
    );
  }
