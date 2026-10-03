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
import { Batch, BatchData } from "@/models/Batch";
import {
  appendDimension,
  crossDimensions,
  deleteDimension,
  deleteValueClustering,
  emptyValueClustering,
  emptyCompositeClustering,
  recomputeComposite,
  mergeValueClusterings,
  dimensionIdsKeyOf,
} from "@/utils/dimension";
import { callApi, getApi } from "@/app/apis/api";
import {
  ExtractDimensionInputType,
  ExtractDimensionOutputType,
  DimensionValueClusterInputType,
  DimensionValueClusterOutputType,
  ExtractDimensionValuesInputType,
  ExtractDimensionValuesOutputType,
  GetWorkspaceOutputType,
  GetBatchDataOutputType,
  ReplaceWorkspaceInputType,
  ReplaceWorkspaceOutputType,
  ReplaceBatchValueClusteringsInputType,
  ReplaceBatchValueClusteringsOutputType,
} from "@/app/apis/types";
import SimpleBSV from "@/components/SimpleBSV";
import CompositionalBSV from "@/components/CompositionalBSV";
import TrajectoryViewer  from "@/components/TrajectoryViewer";
import AddDimensionDialog, { type AddDimensionInput } from "@/components/dialogs/AddDimensionDialog";
import IngestionCredentialDialog from "@/components/dialogs/IngestionCredentialDialog";
import NewBatchDialog from "@/components/dialogs/NewBatchDialog";
import icon from "@/app/icon.png";
import styles from "./editor.module.css";

const nodeTypes = { simpleBSV: SimpleBSV, compositionalBSV: CompositionalBSV };

const POLL_INTERVAL_MS = 15000;

export default function Home() {
    return (
      <ReactFlowProvider>
        <Editor />
      </ReactFlowProvider>
    );
}

type BSVNodeData = { valueClustering: ValueClustering };

// Every composite (crossed) dimension combination ever created, derived from
// settings.nodePosition keys that contain the "|" separator (dimension ids are
// crypto.randomUUID() values, which never contain "|", so this is unambiguous).
function compositeDimensionIdsList(nodePosition: Record<string, { x: number; y: number }> | undefined): string[][] {
    return Object.keys(nodePosition ?? {})
      .filter((key) => key.includes("|"))
      .map((key) => key.split("|"));
}

// Clusters trajectory moments in `batchData` into each dimension's values (scoped to
// dimensionIds if given, otherwise every dimension). Returns only the freshly computed
// entries — NOT merged with batchData.valueClusterings — so callers can merge them in via
// a functional state update against whatever the latest state is by the time this resolves,
// rather than against a `batchData` snapshot that may be stale by then (e.g. if the user
// triggered clustering for two different dimensions back to back).
async function clusterDimensionValues(
    batchData: BatchData,
    dimensions: Dimension[],
    domainDescription: string | undefined,
    dimensionIds?: string[],
): Promise<ValueClustering[]> {
    if (!batchData.trajectories.length || !dimensions.length) return [];

    const dimensionsToCluster = dimensionIds
      ? dimensions.filter((dimension) => dimensionIds.includes(dimension.id))
      : dimensions;
    if (dimensionsToCluster.length === 0) return [];

    const result = await callApi<DimensionValueClusterInputType, DimensionValueClusterOutputType>(
      "/apis/DimensionValueCluster",
      {
        trajectories: batchData.trajectories,
        dimensions: dimensionsToCluster,
        domainDescription,
      },
    );

    return result.valueClusterings;
}

function Editor() {
    const { id } = useParams<{ id: string }>();
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [batchData, setBatchData] = useState<BatchData | null>(null);
    const [pendingBatchIds, setPendingBatchIds] = useState<string[]>([]);
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

    const batchesRef = useRef<Batch[]>([]);
    useEffect(() => { batchesRef.current = batches; }, [batches]);

    // Fire-and-forget persistence of workspace metadata (title, dimensions, settings).
    // Trajectories and value clusterings live in their own per-batch rows now, so there's
    // nothing here for a stale snapshot to clobber.
    const persistWorkspace = (updatedWorkspace: Workspace) => {
      callApi<ReplaceWorkspaceInputType, ReplaceWorkspaceOutputType>(
        `/apis/Workspace/${id}`,
        { workspace: updatedWorkspace },
        "PUT",
      ).catch((err) => console.error("Failed to save workspace", err));
    };

    const persistBatchValueClusterings = (batchId: string, valueClusterings: ValueClustering[]) => {
      callApi<ReplaceBatchValueClusteringsInputType, ReplaceBatchValueClusteringsOutputType>(
        `/apis/Workspace/${id}/Batches/${batchId}/ValueClusterings`,
        { valueClusterings },
        "PUT",
      ).catch((err) => console.error("Failed to save batch value clusterings", err));
    };

    // Every turn order (1-indexed position within a trajectory) that some trajectory in
    // the selected batch actually has a turn at, sorted ascending.
    const turnOrders = useMemo(() => {
      const orders = new Set<number>();
      for (const trajectory of batchData?.trajectories ?? []) {
        trajectory.turns.forEach((_, index) => orders.add(index + 1));
      }
      return Array.from(orders).sort((a, b) => a - b);
    }, [batchData?.trajectories]);

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

      const dimensionId = crypto.randomUUID();
      // input.values are user-entered; pass them through as each dimension's existing
      // "values" so the LLM extracts additional ones instead of regenerating these.
      let values = input.values;

      if (batchData?.trajectories.length) {
        const result = await callApi<ExtractDimensionValuesInputType, ExtractDimensionValuesOutputType>(
          "/apis/ExtractDimensionValues",
          {
            trajectories: batchData.trajectories,
            dimensions: [{ id: dimensionId, name: input.name, description: input.description, values: input.values }],
            domainDescription: workspace.domainDescription,
          },
        );
        values = result.dimensions[0]?.values ?? input.values;
      }

      const dimension: Dimension = {
        id: dimensionId,
        name: input.name,
        description: input.description,
        values,
      };

      const updatedWorkspace = appendDimension(workspace, dimension);
      setWorkspace(updatedWorkspace);
      persistWorkspace(updatedWorkspace);
    };

    const handleExtractDimension = async () => {
      if (!workspace || !batchData?.trajectories.length || !selectedBatchId) return;

      const result = await callApi<ExtractDimensionInputType, ExtractDimensionOutputType>(
        "/apis/ExtractDimension",
        {
          trajectories: batchData.trajectories,
          domainDescription: workspace.domainDescription,
          existingDimensions: workspace.dimensions?.map(({ name, description }) => ({ name, description })),
        },
      );

      const appendedWorkspace = result.dimensions.reduce(
        (ws, dimension) => appendDimension(ws, dimension),
        workspace,
      );
      setWorkspace(appendedWorkspace);
      persistWorkspace(appendedWorkspace);

      // Cluster only the dimensions we just extracted, and only for the batch being viewed.
      const fresh = await clusterDimensionValues(
        batchData,
        appendedWorkspace.dimensions ?? [],
        appendedWorkspace.domainDescription,
        result.dimensions.map((dimension) => dimension.id),
      );
      setBatchData((prev) => {
        if (!prev) return prev;
        const valueClusterings = mergeValueClusterings(prev.valueClusterings, fresh);
        persistBatchValueClusterings(selectedBatchId, valueClusterings);
        return { ...prev, valueClusterings };
      });
    };

    // Merges `fresh` into the LATEST batchData at commit time (not whatever batchData looked
    // like when clustering started) so clustering two different dimensions back to back can't
    // have one's result clobber the other's.
    const handleDimensionValueCluster = async (dimensionIds?: string[]) => {
      if (!workspace || !batchData || !selectedBatchId) return;

      const fresh = await clusterDimensionValues(
        batchData,
        workspace.dimensions ?? [],
        workspace.domainDescription,
        dimensionIds,
      );
      setBatchData((prev) => {
        if (!prev) return prev;
        const valueClusterings = mergeValueClusterings(prev.valueClusterings, fresh);
        persistBatchValueClusterings(selectedBatchId, valueClusterings);
        return { ...prev, valueClusterings };
      });
    };

    const handleDownloadWorkspace = async () => {
      if (!workspace || !id) return;

      // Sequential, not Promise.all — a workspace can have a large number of batches, and
      // firing one request per batch all at once would be the exact "load everything at
      // once" cost this feature's storage split was built to avoid.
      const batchesData: { batch: Batch; data: BatchData }[] = [];
      for (const batch of batches) {
        const result = await getApi<GetBatchDataOutputType>(`/apis/Workspace/${id}/Batches/${batch.id}`);
        batchesData.push({ batch, data: result.data });
      }

      const exported = { workspace, batches: batchesData };
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      const link = document.createElement("a");
      link.href = url;
      link.download = `${workspace.title || "untitled_workspace"}_${timestamp}.json`;
      link.click();

      URL.revokeObjectURL(url);
    };

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

    // Deleting a dimension also prunes any composite nodePosition entry that referenced
    // it — otherwise that composite's node would keep appearing (with a broken label, since
    // the dimension is gone) and keep getting recomputed with stale data on every future
    // "new batch" auto-recluster, since node existence is derived purely from nodePosition.
    const handleDeleteDimension = (dimensionId: string) => {
      setWorkspace((prev) => {
        if (!prev) return prev;

        const withoutDimension = deleteDimension(prev, dimensionId);
        const nodePosition = { ...withoutDimension.settings?.nodePosition };
        for (const key of Object.keys(nodePosition)) {
          if (key.includes("|") && key.split("|").includes(dimensionId)) {
            delete nodePosition[key];
          }
        }

        const updatedWorkspace: Workspace = {
          ...withoutDimension,
          settings: { ...withoutDimension.settings, nodePosition },
        };
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    // Deleting a composite node removes its nodePosition entry (the only workspace-level
    // record of its existence, see compositeDimensionIdsList) and strips it from the
    // currently-loaded batch's value clusterings. Other, unvisited batches may still have a
    // stale entry for it — harmless, since nothing renders a composite that isn't also
    // registered in nodePosition.
    const handleDeleteValueClustering = (dimensionIds: string[]) => {
      const key = dimensionIds.join("|");

      setWorkspace((prev) => {
        if (!prev) return prev;

        const nodePosition = { ...prev.settings?.nodePosition };
        delete nodePosition[key];

        const updatedWorkspace: Workspace = { ...prev, settings: { ...prev.settings, nodePosition } };
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });

      setBatchData((prev) => {
        if (!prev) return prev;

        const valueClusterings = deleteValueClustering(prev.valueClusterings, dimensionIds);
        if (selectedBatchId) persistBatchValueClusterings(selectedBatchId, valueClusterings);
        return { ...prev, valueClusterings };
      });
    };

    const handleMomentClick = (moment: TrajectoryMoment) => {
      setCurrTrajectoryMoment(moment);

      const trajectory = batchData?.trajectories.find((trajectory) => trajectory.id === moment.trajectoryId);
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

    // Highlight, for every trajectory in the selected batch, whichever single moment (if
    // any) falls at the chosen turn order; "all" clears the filter back to nothing highlighted.
    const handleTurnOrderChange = (turnOrder: number | "all") => {
      setSelectedTurnOrder(turnOrder);

      if (turnOrder === "all") {
        setHighlightedTrajectoryMoments([]);
        return;
      }

      const moments: TrajectoryMoment[] = [];
      for (const trajectory of batchData?.trajectories ?? []) {
        const turn = trajectory.turns[turnOrder - 1];
        if (turn) moments.push({ trajectoryId: trajectory.id, turnId: turn.id });
      }
      setHighlightedTrajectoryMoments(moments);
    };

    // Switching batches invalidates the turn-order selection and any highlighted/current
    // moment, since all three referred to the previous batch's (now unloaded) trajectories.
    const handleBatchChange = (batchId: string) => {
      setSelectedBatchId(batchId);
      setSelectedTurnOrder("all");
      setHighlightedTrajectoryMoments([]);
      setCurrTrajectoryMoment(undefined);
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

      const vcA = (node.data as BSVNodeData).valueClustering;
      const vcB = (target.data as BSVNodeData).valueClustering;
      if (!vcA?.dimensionIds.length || !vcB?.dimensionIds.length) return;

      const overlapsExistingDimension = vcA.dimensionIds.some((dimId) => vcB.dimensionIds.includes(dimId));
      if (overlapsExistingDimension) return;

      setBatchData((prev) => {
        if (!prev) return prev;

        const valueClusterings = crossDimensions(prev.valueClusterings, vcA, vcB);
        if (selectedBatchId) persistBatchValueClusterings(selectedBatchId, valueClusterings);
        return { ...prev, valueClusterings };
      });

      // Register the combination in settings.nodePosition (if not already) — this is the
      // only workspace-level record of a composite's existence, so every other batch keeps
      // showing this node (empty, until crossed for it too) instead of it only existing here.
      const combinedKey = [...vcA.dimensionIds, ...vcB.dimensionIds].join("|");
      setWorkspace((prev) => {
        if (!prev) return prev;
        if (prev.settings?.nodePosition?.[combinedKey]) return prev;

        const nodePosition = {
          ...prev.settings?.nodePosition,
          [combinedKey]: {
            x: (node.position.x + target.position.x) / 2,
            y: (node.position.y + target.position.y) / 2,
          },
        };
        const updatedWorkspace: Workspace = { ...prev, settings: { ...prev.settings, nodePosition } };
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

    // No answer needed to keep the new batch's trajectories/metadata visible in the slider —
    // the polling effect already merged them into local `batches` state.
    const handleNewBatchNo = () => {
      setPendingBatchIds([]);
    };

    // Reclusters every existing dimension (and recomputes every existing composite) against
    // the newly arrived batch, persists the result, then switches the view to it. The PUT
    // below is deliberately awaited (unlike this file's usual fire-and-forget persistence)
    // so the batch's data is already correct server-side by the time anything re-fetches it.
    const handleNewBatchYes = async () => {
      const newestId = pendingBatchIds[pendingBatchIds.length - 1];
      setPendingBatchIds([]);
      if (!workspace || !id || !newestId) return;

      const newBatchResult = await getApi<GetBatchDataOutputType>(`/apis/Workspace/${id}/Batches/${newestId}`);
      let valueClusterings = await clusterDimensionValues(
        newBatchResult.data,
        workspace.dimensions ?? [],
        workspace.domainDescription,
      );

      for (const dimensionIds of compositeDimensionIdsList(workspace.settings?.nodePosition)) {
        const recomputed = recomputeComposite(valueClusterings, dimensionIds);
        if (!recomputed) continue;

        const key = dimensionIdsKeyOf(dimensionIds);
        valueClusterings = [
          ...valueClusterings.filter((vc) => dimensionIdsKeyOf(vc.dimensionIds) !== key),
          recomputed,
        ];
      }

      await callApi<ReplaceBatchValueClusteringsInputType, ReplaceBatchValueClusteringsOutputType>(
        `/apis/Workspace/${id}/Batches/${newestId}/ValueClusterings`,
        { valueClusterings },
        "PUT",
      );

      handleBatchChange(newestId);
      setBatchData({ ...newBatchResult.data, valueClusterings });
    };

    useEffect(() => {
      if (!id) return;
      getApi<GetWorkspaceOutputType>(`/apis/Workspace/${id}`).then((result) => {
        setWorkspace(result.workspace);
        setBatches(result.batches);
        setIngestionToken(result.ingestionToken);
      });
    }, [id]);

    // Defaults to the most recent batch the first time batches become available, without
    // overriding a selection the user already made.
    useEffect(() => {
      if (batches.length === 0) return;
      if (selectedBatchId && batches.some((batch) => batch.id === selectedBatchId)) return;
      setSelectedBatchId(batches[batches.length - 1].id);
    }, [batches, selectedBatchId]);

    useEffect(() => {
      if (!id || !selectedBatchId) return;
      getApi<GetBatchDataOutputType>(`/apis/Workspace/${id}/Batches/${selectedBatchId}`).then((result) => {
        setBatchData(result.data);
      });
    }, [id, selectedBatchId]);

    // Polls a cheap metadata-and-batch-list endpoint (never full trajectory data) for
    // batches pushed while this tab is open. Depends only on `id` — never on `workspace`/
    // `batches` — so routine edits never tear down and recreate the interval; the tick
    // reads the latest known batches via a ref instead.
    useEffect(() => {
      if (!id) return;
      let cancelled = false;
      let fetching = false;

      const tick = async () => {
        if (fetching) return;
        fetching = true;
        try {
          const result = await getApi<GetWorkspaceOutputType>(`/apis/Workspace/${id}`);
          if (cancelled) return;

          const knownIds = new Set(batchesRef.current.map((batch) => batch.id));
          const newBatches = result.batches.filter((batch) => !knownIds.has(batch.id));
          if (newBatches.length > 0) {
            setBatches((prev) => [...prev, ...newBatches]);
            setPendingBatchIds((ids) => Array.from(new Set([...ids, ...newBatches.map((batch) => batch.id)])));
          }
        } catch (err) {
          console.error("Failed to poll for new batches", err);
        } finally {
          fetching = false;
        }
      };

      const intervalId = setInterval(tick, POLL_INTERVAL_MS);
      return () => { cancelled = true; clearInterval(intervalId); };
    }, [id]);

    useEffect(() => {
      const dimensions = workspace?.dimensions ?? [];
      const nodePosition = workspace?.settings?.nodePosition ?? {};
      const valueClusterings = batchData?.valueClusterings ?? [];
      const trajectories = batchData?.trajectories ?? [];

      const simpleNodes = dimensions.map((dimension, index) => {
        const valueClustering = valueClusterings.find(
          (vc) => vc.dimensionIds.length === 1 && vc.dimensionIds[0] === dimension.id,
        ) ?? emptyValueClustering(dimension);
        const savedPosition = nodePosition[dimension.id];

        return {
          id: dimension.id,
          type: "simpleBSV",
          position: savedPosition ?? { x: index * 400, y: 0 },
          data: {
            dimensionName: dimension.name,
            dimensionDescription: dimension.description,
            trajectories,
            valueClustering,
            trajectoryColorSetting,
            compactView: workspace?.settings?.compactView?.[dimension.id]?.enabled ?? true,
            onToggleCompactView: () => handleToggleCompactView(dimension.id),
            onDelete: () => handleDeleteDimension(dimension.id),
            onValueCluster: () => handleDimensionValueCluster([dimension.id]),
            onMomentClick: handleMomentClick,
            onCellClick: handleCellClick,
            highlightedTrajectoryMoments,
          },
        };
      });

      const compositionalNodes = compositeDimensionIdsList(nodePosition).map((dimensionIds, index) => {
        const dimensionIdsKey = dimensionIds.join("|");
        const sortedKey = dimensionIdsKeyOf(dimensionIds);
        const valueClustering = valueClusterings.find(
          (vc) => vc.dimensionIds.length > 1 && dimensionIdsKeyOf(vc.dimensionIds) === sortedKey,
        ) ?? emptyCompositeClustering(dimensionIds);
        const savedPosition = nodePosition[dimensionIdsKey];
        const dims = dimensionIds.map((dimensionId) => dimensions.find((dimension) => dimension.id === dimensionId));

        return {
          id: dimensionIdsKey,
          type: "compositionalBSV",
          position: savedPosition ?? { x: index * 400, y: 500 },
          data: {
            dimensionNames: dims.map((dimension, i) => dimension?.name ?? dimensionIds[i]),
            dimensionDescriptions: dims.map((dimension) => dimension?.description ?? ""),
            trajectories,
            valueClustering,
            trajectoryColorSetting,
            matrixView: workspace?.settings?.matrixView?.[dimensionIdsKey]?.enabled ?? true,
            onToggleMatrixView: () => handleToggleMatrixView(dimensionIdsKey),
            onDelete: () => handleDeleteValueClustering(dimensionIds),
            onMomentClick: handleMomentClick,
            onCellClick: handleCellClick,
            highlightedTrajectoryMoments,
          },
        };
      });

      setNodes([...simpleNodes, ...compositionalNodes]);
    }, [workspace, batchData, trajectoryColorSetting]);

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
                <span>{selectedTurnOrder === "all" ? "All turns" : `Turn ${selectedTurnOrder}`}</span>
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
              {batches.length > 1 && (
                <div className={styles["turn-order-slider"]} title="select which batch of trajectories to show">
                  <span>
                    {(() => {
                      const idx = batches.findIndex((batch) => batch.id === selectedBatchId);
                      return idx < 0 ? "" : `Batch ${idx + 1} · ${new Date(batches[idx].createdAt).toLocaleString()}`;
                    })()}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={batches.length - 1}
                    step={1}
                    value={Math.max(0, batches.findIndex((batch) => batch.id === selectedBatchId))}
                    onChange={(e) => handleBatchChange(batches[Number(e.target.value)].id)}
                  />
                </div>
              )}
              <button onClick={() => {handleAddDimension()}} title="add new dimension"><Plus size={16} /></button>
              <button onClick={() => {handleExtractDimension()}}title="exract dimensions from trajectories"><Sparkles size={16} /></button>
              <button onClick={() => {handleClearHighlightedTrajectoryMoment()}} title="clear highlighted trajectory moments" aria-label="clear highlighted trajectory moments">
                <FilterX size={16} />
              </button>
          </div>
          <div className={styles["trajectory-viewer"]}>
            <TrajectoryViewer
              currTrajectoryMoment={currTrajectoryMoment}
              trajectories={batchData?.trajectories ?? []}
              trajectoryColorSetting={trajectoryColorSetting}
              valueClusterings={batchData?.valueClusterings ?? []}
              dimensions={workspace?.dimensions ?? []}
              onBackToOverview={() => setCurrTrajectoryMoment(undefined)}
            />
          </div>
          <div className={styles.canvas}>
            <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={handleNodesChange} onNodeDrag={handleNodeDrag} onNodeDragStop={handleNodeDragStop} />
          </div>
          <pre>{JSON.stringify({ workspace, batches, selectedBatchId, batchData }, null, 2)}</pre>
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
        {pendingBatchIds.length > 0 && (
          <NewBatchDialog onConfirm={handleNewBatchYes} onCancel={handleNewBatchNo} />
        )}
      </>
    );
  }
