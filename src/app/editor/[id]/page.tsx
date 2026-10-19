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
  renameDimensionValue,
  deleteDimensionValue,
  addDimensionValue,
  moveDimensionValue,
  sanitizeDimensionValue,
  migrateStateNodePositions,
} from "@/utils/dimension";
import { ensureTrajectoryColors } from "@/utils/trajectory";
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

// Sanitizes (see sanitizeDimensionValue) and dedupes a batch of values from a single source —
// used wherever a dimension's initial values can come from free text: the user's own input,
// or an LLM's (ExtractDimension/ExtractDimensionValues) response.
function sanitizeDimensionValues(rawValues: string[]): string[] {
    return Array.from(new Set(rawValues.map(sanitizeDimensionValue).filter(Boolean)));
}

// Recomputes every composite built (at least in part) from `affectedDimensionIds`'s own
// simple ValueClustering(s) and splices the result into `valueClusterings` — used both when a
// brand-new batch is first clustered (every composite needs computing; pass no
// `affectedDimensionIds`) and when an existing batch re-clusters a subset of its dimensions
// (only composites referencing one of them need refreshing, since re-clustering a simple
// ValueClustering otherwise leaves any composite built from it frozen — see
// mergeValueClusterings).
function recomputeAffectedComposites(
    valueClusterings: ValueClustering[],
    nodePosition: Record<string, { x: number; y: number }> | undefined,
    affectedDimensionIds?: string[],
): ValueClustering[] {
    let result = valueClusterings;
    for (const compositeIds of compositeDimensionIdsList(nodePosition)) {
        if (affectedDimensionIds && affectedDimensionIds.every((id) => !compositeIds.includes(id))) continue;

        const recomputed = recomputeComposite(result, compositeIds);
        if (!recomputed) continue;

        const key = dimensionIdsKeyOf(compositeIds);
        result = [...result.filter((vc) => dimensionIdsKeyOf(vc.dimensionIds) !== key), recomputed];
    }
    return result;
}

// Rough footprint of a BSV node, used only to space freshly-placed nodes apart from each
// other (see findFreePosition) — doesn't need to match the real rendered size exactly.
const DEFAULT_NODE_WIDTH = 380;
const DEFAULT_NODE_HEIGHT = 360;

// A spatial hash of positions, bucketed by node footprint, so an overlap check only has to
// scan the (up to 9) neighboring buckets instead of every position ever placed — O(local
// density) instead of O(n) per check, which matters since findFreePosition below calls this
// up to ~1680 times (20 rings) for every newly-added node.
function createPositionIndex(initial: { x: number; y: number }[]) {
    const buckets = new Map<string, { x: number; y: number }[]>();
    const bucketKeyOf = (x: number, y: number) => `${Math.floor(x / DEFAULT_NODE_WIDTH)},${Math.floor(y / DEFAULT_NODE_HEIGHT)}`;

    const add = (position: { x: number; y: number }) => {
        const key = bucketKeyOf(position.x, position.y);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(position);
        else buckets.set(key, [position]);
    };
    initial.forEach(add);

    const overlaps = (candidate: { x: number; y: number }): boolean => {
        const bx = Math.floor(candidate.x / DEFAULT_NODE_WIDTH);
        const by = Math.floor(candidate.y / DEFAULT_NODE_HEIGHT);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const neighbors = buckets.get(`${bx + dx},${by + dy}`);
            if (neighbors?.some((t) => Math.abs(candidate.x - t.x) < DEFAULT_NODE_WIDTH && Math.abs(candidate.y - t.y) < DEFAULT_NODE_HEIGHT)) {
              return true;
            }
          }
        }
        return false;
    };

    return { add, overlaps };
}

// Spiral/ring search outward from `center` for the nearest point that doesn't overlap
// anything in `positions`, so newly-added nodes land near the viewport center instead of off
// in a fixed grid, while still spreading apart from each other and from existing nodes.
function findFreePosition(
    center: { x: number; y: number },
    positions: ReturnType<typeof createPositionIndex>,
): { x: number; y: number } {
    const RING_STEP = 60;
    const MAX_RINGS = 20;

    if (!positions.overlaps(center)) return center;

    for (let ring = 1; ring <= MAX_RINGS; ring++) {
      const pointsOnRing = 8 * ring;
      for (let i = 0; i < pointsOnRing; i++) {
        const angle = (2 * Math.PI * i) / pointsOnRing;
        const candidate = {
          x: center.x + Math.cos(angle) * ring * RING_STEP,
          y: center.y + Math.sin(angle) * ring * RING_STEP,
        };
        if (!positions.overlaps(candidate)) return candidate;
      }
    }

    // Extremely dense layout (20 rings' worth of candidates all taken) — fall back to
    // stacking on the center rather than searching forever, but at least say so.
    console.warn("findFreePosition: exhausted search radius; placing a new node on top of an existing one");
    return center;
}

// Clusters trajectory moments in `batchData` into each dimension's values (scoped to
// dimensionIds if given, otherwise every dimension), one dimension per API call so each
// result can be handed to `onDimensionClustered` — and so the caller can update the UI — as
// soon as THAT dimension is done, rather than waiting for every dimension to finish. The
// first dimension runs alone to prime the server's prompt cache (shared trajectory context
// across dimensions); the rest run in parallel against the now-cached prefix once it lands.
async function clusterDimensionValues(
    batchData: BatchData,
    dimensions: Dimension[],
    domainDescription: string | undefined,
    dimensionIds: string[] | undefined,
    onDimensionClustered: (valueClustering: ValueClustering) => void,
): Promise<void> {
    if (!batchData.trajectories.length || !dimensions.length) return;

    const dimensionsToCluster = dimensionIds
      ? dimensions.filter((dimension) => dimensionIds.includes(dimension.id))
      : dimensions;
    if (dimensionsToCluster.length === 0) return;

    const clusterOne = async (dimension: Dimension) => {
        const result = await callApi<DimensionValueClusterInputType, DimensionValueClusterOutputType>(
          "/apis/DimensionValueCluster",
          { trajectories: batchData.trajectories, dimension, domainDescription },
        );
        onDimensionClustered(result.valueClustering);
    };

    const [firstDimension, ...restDimensions] = dimensionsToCluster;
    await clusterOne(firstDimension);
    await Promise.all(restDimensions.map(clusterOne));
}

function Editor() {
    const { id } = useParams<{ id: string }>();
    const [workspace, setWorkspaceRaw] = useState<Workspace | null>(null);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    // Defaults to the most recent batch whenever selectedBatchId hasn't been explicitly set
    // (or no longer refers to a batch that exists), without needing an effect to echo it into
    // state.
    const effectiveSelectedBatchId =
      selectedBatchId && batches.some((batch) => batch.id === selectedBatchId)
        ? selectedBatchId
        : batches[batches.length - 1]?.id ?? null;
    // Mirrors effectiveSelectedBatchId for reads from callbacks that can fire well after the
    // render that captured it in their closure (e.g. a progressive clustering callback for a
    // batch the user has since switched away from). Only needs to catch up within
    // network-latency timescales (a clustering call takes seconds), not same-tick, so the
    // usual one-commit-behind lag of an effect-based sync is not a concern here.
    const effectiveSelectedBatchIdRef = useRef(effectiveSelectedBatchId);
    useEffect(() => { effectiveSelectedBatchIdRef.current = effectiveSelectedBatchId; }, [effectiveSelectedBatchId]);
    const [batchData, setBatchData] = useState<BatchData | null>(null);
    const [pendingBatchIds, setPendingBatchIds] = useState<string[]>([]);
    const [clusteringBatchId, setClusteringBatchId] = useState<string | null>(null);
    const [ingestionToken, setIngestionToken] = useState<string | null>(null);
    const [isIngestionDialogOpen, setIsIngestionDialogOpen] = useState(false);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [isAddDimensionOpen, setIsAddDimensionOpen] = useState(false);
    const [currTrajectoryMoment, setCurrTrajectoryMoment] = useState<TrajectoryMoment | undefined>(undefined);
    const [highlightedTrajectoryMoments, setHighlightedTrajectoryMoments] = useState<TrajectoryMoment[]>([]);
    const [clusteringDimensionIds, setClusteringDimensionIds] = useState<string[]>([]);

    // Marks the given dimensions as clustering for the duration of `run`, so their BSV nodes can show a progress state.
    const withClusteringIndicator = async <T,>(dimensionIds: string[], run: () => Promise<T>): Promise<T> => {
      setClusteringDimensionIds((prev) => [...prev, ...dimensionIds]);
      try {
        return await run();
      } finally {
        setClusteringDimensionIds((prev) => prev.filter((id) => !dimensionIds.includes(id)));
      }
    };

    // Merges one freshly-clustered dimension's result into batchData, recomputes any
    // composite built from it, persists, and clears its own clustering indicator — called
    // once per dimension as clusterDimensionValues' progressive callback fires, so each
    // dimension's BSV (and any composite built from it) updates on the canvas as soon as
    // that one dimension is done, instead of all of them waiting for the slowest.
    //
    // `batchId` is the batch this clustering run was started for, captured once by the
    // caller — not read live — since a multi-dimension run can span long enough for the user
    // to switch to a different batch before every dimension resolves. If that's happened by
    // the time this particular dimension comes back, its result is dropped rather than merged
    // into whatever batch is now displayed (wrong data shown) or persisted against a
    // valueClusterings snapshot that no longer reflects the batch it was computed for.
    const applyFreshDimensionClustering = (batchId: string, valueClustering: ValueClustering) => {
      if (batchId !== effectiveSelectedBatchIdRef.current) {
        console.warn(`Discarding clustering result for a dimension of batch ${batchId}: a different batch is now selected. Re-cluster to pick it up.`);
        setClusteringDimensionIds((prev) => prev.filter((id) => !valueClustering.dimensionIds.includes(id)));
        return;
      }

      setBatchData((prev) => {
        if (!prev) return prev;
        const merged = mergeValueClusterings(prev.valueClusterings, [valueClustering]);
        const valueClusterings = recomputeAffectedComposites(merged, workspaceRef.current?.settings?.nodePosition, valueClustering.dimensionIds);
        persistBatchValueClusterings(batchId, valueClusterings);
        return { ...prev, valueClusterings };
      });
      setClusteringDimensionIds((prev) => prev.filter((id) => !valueClustering.dimensionIds.includes(id)));
    };
    const [selectedTurnOrder, setSelectedTurnOrder] = useState<number | "all">("all");
    const { getIntersectingNodes, screenToFlowPosition } = useReactFlow();

    const batchesRef = useRef<Batch[]>([]);
    useEffect(() => { batchesRef.current = batches; }, [batches]);

    // Mirrors `workspace` for synchronous reads in applyDimensionUpdate/applyDimensionValueEdit
    // below — a plain `workspace` closure read can be one edit behind if two edits fire in the
    // same tick (e.g. a rename committed via both Enter and the input's blur). Kept in sync
    // entirely by the `setWorkspace` wrapper right below (every write in this file goes
    // through it — nothing calls `setWorkspaceRaw` directly), which writes the ref
    // synchronously inside the same state update, not by a separate effect — an effect would
    // only catch up after the next commit, which is exactly the one-tick staleness this ref
    // exists to avoid.
    const workspaceRef = useRef<Workspace | null>(null);

    const setWorkspace = (next: Workspace | null | ((prev: Workspace | null) => Workspace | null)) => {
      setWorkspaceRaw((prev) => {
        const resolved = typeof next === "function" ? (next as (prev: Workspace | null) => Workspace | null)(prev) : next;
        workspaceRef.current = resolved;
        return resolved;
      });
    };

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

    // Queued (not fired independently) because progressive per-dimension clustering can call
    // this multiple times in quick succession for the same batch, each with a full-replace
    // snapshot of valueClusterings — the endpoint overwrites wholesale, with no merge or
    // version check, so two such PUTs racing over the network with no ordering guarantee
    // could land out of order and have the more-complete snapshot silently overwritten by an
    // earlier, less-complete one. Chaining through persistQueueRef ensures each PUT is only
    // sent once the previous one has settled, so arrival order always matches call order.
    const persistQueueRef = useRef<Promise<unknown>>(Promise.resolve());
    const persistBatchValueClusterings = (batchId: string, valueClusterings: ValueClustering[]) => {
      persistQueueRef.current = persistQueueRef.current.then(() =>
        callApi<ReplaceBatchValueClusteringsInputType, ReplaceBatchValueClusteringsOutputType>(
          `/apis/Workspace/${id}/Batches/${batchId}/ValueClusterings`,
          { valueClusterings },
          "PUT",
        ).catch((err) => console.error("Failed to save batch value clusterings", err)),
      );
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
      let values = sanitizeDimensionValues(input.values);

      if (batchData?.trajectories.length) {
        const result = await callApi<ExtractDimensionValuesInputType, ExtractDimensionValuesOutputType>(
          "/apis/ExtractDimensionValues",
          {
            trajectories: batchData.trajectories,
            dimensions: [{ id: dimensionId, name: input.name, description: input.description, values }],
            domainDescription: workspace.domainDescription,
          },
        );
        values = sanitizeDimensionValues(result.dimensions[0]?.values ?? values);
      }

      const dimension: Dimension = {
        id: dimensionId,
        name: input.name,
        description: input.description,
        values,
      };

      // Reads workspaceRef, not the `workspace` closure captured before the awaits above
      // (an LLM call can take several seconds), so a concurrent edit elsewhere isn't reverted.
      const updatedWorkspace = appendDimension(workspaceRef.current ?? workspace, dimension);
      setWorkspace(updatedWorkspace);
      persistWorkspace(updatedWorkspace);
    };

    const handleExtractDimension = async () => {
      if (!workspace || !batchData?.trajectories.length || !effectiveSelectedBatchId) return;
      const batchId = effectiveSelectedBatchId;

      const result = await callApi<ExtractDimensionInputType, ExtractDimensionOutputType>(
        "/apis/ExtractDimension",
        {
          trajectories: batchData.trajectories,
          domainDescription: workspace.domainDescription,
          existingDimensions: workspace.dimensions?.map(({ name, description }) => ({ name, description })),
        },
      );

      // Same reasoning as handleSubmitAddDimension: use workspaceRef, not the closure captured
      // before the await above, as the base to append the extracted dimensions onto.
      const appendedWorkspace = result.dimensions.reduce(
        (ws, dimension) => appendDimension(ws, { ...dimension, values: sanitizeDimensionValues(dimension.values) }),
        workspaceRef.current ?? workspace,
      );
      setWorkspace(appendedWorkspace);
      persistWorkspace(appendedWorkspace);

      // Cluster only the dimensions we just extracted, and only for the batch being viewed.
      const extractedIds = result.dimensions.map((dimension) => dimension.id);
      await withClusteringIndicator(extractedIds, () => clusterDimensionValues(
        batchData,
        appendedWorkspace.dimensions ?? [],
        appendedWorkspace.domainDescription,
        extractedIds,
        (valueClustering) => applyFreshDimensionClustering(batchId, valueClustering),
      ));
    };

    // Merges `fresh` into the LATEST batchData at commit time (not whatever batchData looked
    // like when clustering started) so clustering two different dimensions back to back can't
    // have one's result clobber the other's.
    const handleDimensionValueCluster = async (dimensionIds?: string[]) => {
      if (!workspace || !batchData || !effectiveSelectedBatchId) return;
      const batchId = effectiveSelectedBatchId;

      const targetIds = dimensionIds ?? (workspace.dimensions ?? []).map((dimension) => dimension.id);
      await withClusteringIndicator(targetIds, () => clusterDimensionValues(
        batchData,
        workspace.dimensions ?? [],
        workspace.domainDescription,
        dimensionIds,
        (valueClustering) => applyFreshDimensionClustering(batchId, valueClustering),
      ));
    };

    // "Cluster all" re-runs every dimension's clustering (overwriting any manual edits made
    // to existing value assignments) in one go, so confirm first — unlike re-clustering a
    // single dimension from its own BSV, which doesn't need one.
    const handleClusterAllClick = () => {
      const confirmed = window.confirm(
        "Re-cluster every dimension in this batch? This recomputes trajectory moment assignments for all dimensions and replaces the current ones. This cannot be undone."
      );
      if (confirmed) handleDimensionValueCluster();
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

    const handleToggleArrows = (key: string) => {
      setWorkspace((prev) => {
        if (!prev) return prev;

        const currentlyEnabled = prev.settings?.showArrows?.[key]?.enabled ?? true;
        const showArrows = {
          ...prev.settings?.showArrows,
          [key]: { enabled: !currentlyEnabled },
        };

        const updatedWorkspace: Workspace = {
          ...prev,
          settings: { ...prev.settings, showArrows },
        };
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    const handleStateNodePositionChange = (dimensionIdsKey: string, nodeId: string, position: { x: number; y: number }) => {
      setWorkspace((prev) => {
        if (!prev) return prev;

        const stateNodePosition = {
          ...prev.settings?.stateNodePosition,
          [dimensionIdsKey]: {
            ...prev.settings?.stateNodePosition?.[dimensionIdsKey],
            [nodeId]: position,
          },
        };

        const updatedWorkspace: Workspace = {
          ...prev,
          settings: { ...prev.settings, stateNodePosition },
        };
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    // Drops any settings-map entry that is either an exact match for `dimensionId` (the
    // simple-BSV form of that setting, e.g. compactView/showArrows) or a composite key
    // ("id1|id2", e.g. nodePosition/matrixView/showArrows/stateNodePosition) that includes it
    // (the combined-BSV form) — so a deleted dimension's per-node settings don't linger
    // forever, and don't silently resurface if the same dimension pair is recreated later.
    const pruneSettingsEntriesForDimension = <T,>(
      record: Record<string, T> | undefined,
      dimensionId: string,
    ): Record<string, T> | undefined => {
      if (!record) return record;
      const entries = Object.entries(record).filter(
        ([key]) => key !== dimensionId && !(key.includes("|") && key.split("|").includes(dimensionId)),
      );
      return entries.length === Object.keys(record).length ? record : Object.fromEntries(entries);
    };

    // Deleting a dimension also prunes any composite nodePosition entry that referenced
    // it — otherwise that composite's node would keep appearing (with a broken label, since
    // the dimension is gone) and keep getting recomputed with stale data on every future
    // "new batch" auto-recluster, since node existence is derived purely from nodePosition —
    // and prunes the dimension's own (and any composite's) matrixView/showArrows/compactView/
    // stateNodePosition entries the same way, so they don't leak indefinitely either.
    const handleDeleteDimension = (dimensionId: string) => {
      setWorkspace((prev) => {
        if (!prev) return prev;

        const withoutDimension = deleteDimension(prev, dimensionId);
        const settings = withoutDimension.settings ?? {};

        const updatedWorkspace: Workspace = {
          ...withoutDimension,
          settings: {
            ...settings,
            nodePosition: pruneSettingsEntriesForDimension(settings.nodePosition, dimensionId) ?? {},
            matrixView: pruneSettingsEntriesForDimension(settings.matrixView, dimensionId),
            showArrows: pruneSettingsEntriesForDimension(settings.showArrows, dimensionId),
            compactView: pruneSettingsEntriesForDimension(settings.compactView, dimensionId),
            stateNodePosition: pruneSettingsEntriesForDimension(settings.stateNodePosition, dimensionId),
          },
        };
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });
    };

    const withDimensionUpdated = (prevWorkspace: Workspace, dimensionId: string, updatedDimension: Dimension): Workspace => ({
      ...prevWorkspace,
      dimensions: (prevWorkspace.dimensions ?? []).map((d) => (d.id === dimensionId ? updatedDimension : d)),
    });

    // Applies `transformDimension` to one dimension and, optionally, `transformSettings` to
    // workspace.settings in the same update (e.g. migrating stateNodePosition to follow a
    // rename). Uses workspaceRef — not the `workspace` closure, and not a functional
    // setWorkspace updater (whose result can't be read back out in time for callers that also
    // need to sync batchData off the same resolved Dimension) — so two edits fired in the same
    // tick (e.g. SimpleBSV's Enter-then-blur double-commit) see each other's result instead of
    // both computing from the same pre-edit dimension. Returns the updated Dimension (or null
    // if nothing changed or the dimension is unknown).
    const applyDimensionUpdate = (
      dimensionId: string,
      transformDimension: (dimension: Dimension) => Dimension,
      transformSettings?: (settings: Workspace["settings"]) => Workspace["settings"],
    ): Dimension | null => {
      const currentWorkspace = workspaceRef.current;
      const dimension = currentWorkspace?.dimensions?.find((d) => d.id === dimensionId);
      if (!currentWorkspace || !dimension) return null;

      const updatedDimension = transformDimension(dimension);
      if (updatedDimension === dimension) return null;

      const updatedWorkspace: Workspace = {
        ...withDimensionUpdated(currentWorkspace, dimensionId, updatedDimension),
        settings: transformSettings ? transformSettings(currentWorkspace.settings) : currentWorkspace.settings,
      };
      setWorkspace(updatedWorkspace);
      persistWorkspace(updatedWorkspace);
      return updatedDimension;
    };

    // Applies a rename/delete/add-style edit to one dimension's values and the matching
    // valueClustering entries, via applyDimensionUpdate above for the workspace/dimension
    // side. Both the workspace-side and batchData-side `editFn` calls below are given the SAME
    // pre-edit `dimension` — editFn's guards (e.g. renameDimensionValue/deleteDimensionValue
    // checking `dimension.values.includes(oldValue)`) only hold against the dimension as it
    // was *before* this edit, so passing the already-updated dimension into the second call
    // would make that guard always fail and silently no-op the valueClustering update. The
    // setBatchData call still reads `prevBatchData` functionally, since that side's real race
    // is against something slower and async (e.g. a "cluster this dimension" call resolving in
    // between), which workspaceRef can't help with.
    const applyDimensionValueEdit = (
      dimensionId: string,
      editFn: (dimension: Dimension, valueClusterings: ValueClustering[]) => { dimension: Dimension; valueClusterings: ValueClustering[] },
      transformSettings?: (settings: Workspace["settings"]) => Workspace["settings"],
    ) => {
      const dimension = workspaceRef.current?.dimensions?.find((d) => d.id === dimensionId);
      if (!dimension) return;

      const updatedDimension = applyDimensionUpdate(dimensionId, () => editFn(dimension, []).dimension, transformSettings);
      if (!updatedDimension) return;

      setBatchData((prevBatchData) => {
        if (!prevBatchData) return prevBatchData;

        const { valueClusterings } = editFn(dimension, prevBatchData.valueClusterings);
        if (valueClusterings === prevBatchData.valueClusterings) return prevBatchData;

        if (effectiveSelectedBatchId) persistBatchValueClusterings(effectiveSelectedBatchId, valueClusterings);
        return { ...prevBatchData, valueClusterings };
      });
    };

    const handleRenameDimensionValue = (dimensionId: string, oldValue: string, newValue: string) => {
      const resolvedValue = sanitizeDimensionValue(newValue);
      applyDimensionValueEdit(
        dimensionId,
        (dimension, valueClusterings) => renameDimensionValue(dimension, valueClusterings, oldValue, newValue),
        (settings) => ({
          ...settings,
          stateNodePosition: migrateStateNodePositions(settings?.stateNodePosition, dimensionId, oldValue, resolvedValue),
        }),
      );
    };

    const handleDeleteDimensionValue = (dimensionId: string, value: string) => {
      if (!workspaceRef.current?.dimensions?.some((d) => d.id === dimensionId)) return;

      const confirmed = window.confirm(
        `Delete value "${value}"? Any trajectory moments assigned to it — in this dimension and any combined view built from it — will become unassigned until re-clustered. This cannot be undone.`
      );
      if (!confirmed) return;

      applyDimensionValueEdit(
        dimensionId,
        (dimension, valueClusterings) => deleteDimensionValue(dimension, valueClusterings, value),
        (settings) => ({
          ...settings,
          stateNodePosition: migrateStateNodePositions(settings?.stateNodePosition, dimensionId, value, null),
        }),
      );
    };

    const handleAddDimensionValue = (dimensionId: string, value: string) => {
      applyDimensionValueEdit(dimensionId, (dimension, valueClusterings) =>
        addDimensionValue(dimension, valueClusterings, value),
      );
    };

    const handleMoveDimensionValue = (dimensionId: string, value: string, direction: "up" | "down") => {
      applyDimensionUpdate(dimensionId, (dimension) => moveDimensionValue(dimension, value, direction));
    };

    // Deleting a composite node removes its nodePosition entry (the only workspace-level
    // record of its existence, see compositeDimensionIdsList), its matrixView/showArrows/
    // stateNodePosition entries (so a future composite reusing the same key — e.g. re-crossing
    // the same two dimensions — doesn't silently inherit stale view toggles or drag positions),
    // and strips it from the currently-loaded batch's value clusterings. Other, unvisited
    // batches may still have a stale valueClustering entry for it — harmless, since nothing
    // renders a composite that isn't also registered in nodePosition.
    const handleDeleteValueClustering = (dimensionIds: string[]) => {
      const key = dimensionIds.join("|");

      setWorkspace((prev) => {
        if (!prev) return prev;

        const nodePosition = { ...prev.settings?.nodePosition };
        delete nodePosition[key];
        const matrixView = { ...prev.settings?.matrixView };
        delete matrixView[key];
        const showArrows = { ...prev.settings?.showArrows };
        delete showArrows[key];
        const stateNodePosition = { ...prev.settings?.stateNodePosition };
        delete stateNodePosition[key];

        const updatedWorkspace: Workspace = {
          ...prev,
          settings: { ...prev.settings, nodePosition, matrixView, showArrows, stateNodePosition },
        };
        persistWorkspace(updatedWorkspace);
        return updatedWorkspace;
      });

      setBatchData((prev) => {
        if (!prev) return prev;

        const valueClusterings = deleteValueClustering(prev.valueClusterings, dimensionIds);
        if (effectiveSelectedBatchId) persistBatchValueClusterings(effectiveSelectedBatchId, valueClusterings);
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
        if (effectiveSelectedBatchId) persistBatchValueClusterings(effectiveSelectedBatchId, valueClusterings);
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

    // Clicking a pending batch switches the view to it first (while it's still unclustered),
    // then clusters its trajectory moments against every dimension — same as
    // handleDimensionValueCluster, each dimension's BSV (and any composite built from it)
    // updates on the canvas as soon as that one dimension is done. The per-batch fetch effect
    // above is guarded to skip re-fetching this batch while clusteringBatchId matches it, so
    // this progressive, not-yet-fully-persisted local state isn't clobbered by a fresh GET.
    const handleClusterPendingBatch = async (batchId: string) => {
      if (!workspace || !id || clusteringBatchId) return;

      setClusteringBatchId(batchId);
      try {
        const batchResult = await getApi<GetBatchDataOutputType>(`/apis/Workspace/${id}/Batches/${batchId}`);

        setPendingBatchIds((ids) => ids.filter((pendingId) => pendingId !== batchId));
        handleBatchChange(batchId);
        setBatchData(batchResult.data);

        // Reads workspaceRef, not the `workspace` closure captured before the await above (a
        // real network round trip), so a dimension added/edited/deleted while this batch's
        // data was loading is reflected in what gets clustered.
        const currentWorkspace = workspaceRef.current ?? workspace;
        const targetIds = (currentWorkspace.dimensions ?? []).map((dimension) => dimension.id);
        await withClusteringIndicator(targetIds, () => clusterDimensionValues(
          batchResult.data,
          currentWorkspace.dimensions ?? [],
          currentWorkspace.domainDescription,
          undefined,
          (valueClustering) => applyFreshDimensionClustering(batchId, valueClustering),
        ));

        // applyFreshDimensionClustering's persists are fire-and-forget (queued, not awaited),
        // so wait for the queue to drain before releasing the fetch-effect guard above —
        // otherwise that effect could re-fire (clusteringBatchId resetting is itself a
        // dependency change) and GET the batch before the last dimension's PUT has landed.
        await persistQueueRef.current;
      } finally {
        setClusteringBatchId(null);
      }
    };

    useEffect(() => {
      if (!id) return;
      getApi<GetWorkspaceOutputType>(`/apis/Workspace/${id}`).then((result) => {
        setWorkspace(result.workspace);
        setBatches(result.batches);
        setIngestionToken(result.ingestionToken);
      });
    }, [id]);

    useEffect(() => {
      if (!id || !effectiveSelectedBatchId) return;
      // Skip while this exact batch is the one being progressively clustered —
      // handleClusterPendingBatch switches into viewing it before clustering finishes so its
      // BSVs can update as each dimension resolves, and a fresh GET here would clobber those
      // in-progress local updates with the batch's still-mostly-unclustered server-side data.
      if (clusteringBatchId === effectiveSelectedBatchId) return;
      // Guards against rapid batch switching (e.g. dragging the slider) resolving out of
      // order: React runs this cleanup for the PREVIOUS effect instance before the new one
      // fires whenever effectiveSelectedBatchId changes, so an in-flight fetch for a batch
      // that's no longer selected gets its result ignored instead of overwriting the newer one.
      let cancelled = false;
      getApi<GetBatchDataOutputType>(`/apis/Workspace/${id}/Batches/${effectiveSelectedBatchId}`).then((result) => {
        if (cancelled) return;
        setBatchData(result.data);
        setWorkspace((prev) => {
          if (!prev) return prev;
          const updatedWorkspace = ensureTrajectoryColors(prev, result.data.trajectories);
          if (updatedWorkspace === prev) return prev;
          persistWorkspace(updatedWorkspace);
          return updatedWorkspace;
        });
      });
      return () => { cancelled = true; };
    }, [id, effectiveSelectedBatchId, clusteringBatchId]);

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

      // Nodes with no saved position yet (freshly added) get placed near the current
      // viewport center instead of a fixed grid, spaced apart from everything already
      // placed (saved or just-placed-in-this-pass) via findFreePosition.
      const wrapperRect = reactFlowWrapper.current?.getBoundingClientRect();
      const viewportCenter = wrapperRect
        ? screenToFlowPosition({ x: wrapperRect.left + wrapperRect.width / 2, y: wrapperRect.top + wrapperRect.height / 2 })
        : { x: 0, y: 0 };
      const takenPositions = createPositionIndex(Object.values(nodePosition));
      // Positions assigned below for nodes that don't have a saved one yet — persisted once,
      // right after this render, so they stick instead of being recomputed (and jumping to a
      // new spot) every time this effect reruns for an unrelated reason.
      const newlyPositioned: Record<string, { x: number; y: number }> = {};

      const nextPositionFor = (key: string) => {
        const saved = nodePosition[key];
        if (saved) return saved;
        const position = findFreePosition(viewportCenter, takenPositions);
        takenPositions.add(position);
        newlyPositioned[key] = position;
        return position;
      };

      const simpleNodes = dimensions.map((dimension) => {
        const valueClustering = valueClusterings.find(
          (vc) => vc.dimensionIds.length === 1 && vc.dimensionIds[0] === dimension.id,
        ) ?? emptyValueClustering(dimension);

        return {
          id: dimension.id,
          type: "simpleBSV",
          position: nextPositionFor(dimension.id),
          data: {
            dimensionName: dimension.name,
            dimensionDescription: dimension.description,
            trajectories,
            valueClustering,
            trajectoryColorSetting,
            compactView: workspace?.settings?.compactView?.[dimension.id]?.enabled ?? false,
            onToggleCompactView: () => handleToggleCompactView(dimension.id),
            showArrows: workspace?.settings?.showArrows?.[dimension.id]?.enabled ?? true,
            onToggleArrows: () => handleToggleArrows(dimension.id),
            onDelete: () => handleDeleteDimension(dimension.id),
            onValueCluster: () => handleDimensionValueCluster([dimension.id]),
            dimensionValues: dimension.values,
            onRenameValue: (oldValue: string, newValue: string) => handleRenameDimensionValue(dimension.id, oldValue, newValue),
            onDeleteValue: (value: string) => handleDeleteDimensionValue(dimension.id, value),
            onAddValue: (value: string) => handleAddDimensionValue(dimension.id, value),
            onMoveValue: (value: string, direction: "up" | "down") => handleMoveDimensionValue(dimension.id, value, direction),
            isClustering: clusteringDimensionIds.includes(dimension.id),
            onMomentClick: handleMomentClick,
            onCellClick: handleCellClick,
          },
        };
      });

      const compositionalNodes = compositeDimensionIdsList(nodePosition).map((dimensionIds) => {
        const dimensionIdsKey = dimensionIds.join("|");
        const sortedKey = dimensionIdsKeyOf(dimensionIds);
        const valueClustering = valueClusterings.find(
          (vc) => vc.dimensionIds.length > 1 && dimensionIdsKeyOf(vc.dimensionIds) === sortedKey,
        ) ?? emptyCompositeClustering(dimensionIds);
        const dims = dimensionIds.map((dimensionId) => dimensions.find((dimension) => dimension.id === dimensionId));

        return {
          id: dimensionIdsKey,
          type: "compositionalBSV",
          position: nextPositionFor(dimensionIdsKey),
          data: {
            dimensionNames: dims.map((dimension, i) => dimension?.name ?? dimensionIds[i]),
            dimensionDescriptions: dims.map((dimension) => dimension?.description ?? ""),
            dimensionValuesList: dims.map((dimension) => dimension?.values ?? []),
            trajectories,
            valueClustering,
            trajectoryColorSetting,
            matrixView: workspace?.settings?.matrixView?.[dimensionIdsKey]?.enabled ?? true,
            onToggleMatrixView: () => handleToggleMatrixView(dimensionIdsKey),
            showArrows: workspace?.settings?.showArrows?.[dimensionIdsKey]?.enabled ?? true,
            onToggleArrows: () => handleToggleArrows(dimensionIdsKey),
            onDelete: () => handleDeleteValueClustering(dimensionIds),
            onMomentClick: handleMomentClick,
            onCellClick: handleCellClick,
            stateNodePositions: workspace?.settings?.stateNodePosition?.[dimensionIdsKey],
            onStateNodePositionChange: (nodeId: string, position: { x: number; y: number }) =>
              handleStateNodePositionChange(dimensionIdsKey, nodeId, position),
          },
        };
      });

      setNodes([...simpleNodes, ...compositionalNodes]);

      if (Object.keys(newlyPositioned).length > 0) {
        setWorkspace((prev) => {
          if (!prev) return prev;
          const updatedWorkspace: Workspace = {
            ...prev,
            settings: { ...prev.settings, nodePosition: { ...prev.settings?.nodePosition, ...newlyPositioned } },
          };
          persistWorkspace(updatedWorkspace);
          return updatedWorkspace;
        });
      }
    }, [workspace, batchData, trajectoryColorSetting, clusteringDimensionIds, screenToFlowPosition]);

    // UI-only fields that change far more often than the node data built above; overlaid at
    // render time instead of being patched back into `nodes` state via their own effects.
    const displayNodes = useMemo(
      () =>
        nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            isDropTarget: n.id === dropTargetId,
            currTrajectoryMoment,
            highlightedTrajectoryMoments,
          },
        })),
      [nodes, dropTargetId, currTrajectoryMoment, highlightedTrajectoryMoments],
    );

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
                      const idx = batches.findIndex((batch) => batch.id === effectiveSelectedBatchId);
                      return idx < 0 ? "" : `Batch ${idx + 1} · ${new Date(batches[idx].createdAt).toLocaleString()}`;
                    })()}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={batches.length - 1}
                    step={1}
                    value={Math.max(0, batches.findIndex((batch) => batch.id === effectiveSelectedBatchId))}
                    onChange={(e) => handleBatchChange(batches[Number(e.target.value)].id)}
                  />
                </div>
              )}
              <button onClick={() => {handleAddDimension()}} title="add new dimension"><Plus size={16} /></button>
              <button onClick={() => {handleExtractDimension()}}title="exract dimensions from trajectories"><Sparkles size={16} /></button>
              <button onClick={handleClusterAllClick} title="re-cluster all trajectory moments in this batch across all dimensions" aria-label="re-cluster all trajectory moments in this batch across all dimensions"><Group size={16} /></button>
              <button onClick={() => {handleClearHighlightedTrajectoryMoment()}} title="clear highlighted trajectory moments" aria-label="clear highlighted trajectory moments">
                <FilterX size={16} />
              </button>
              
          </div>
          <div className={styles["right-side-panel"]}>
            <div className={styles["pending-trajectory-batches"]}>
              {pendingBatchIds.map((batchId) => {
                const batch = batches.find((b) => b.id === batchId);
                const isClustering = clusteringBatchId === batchId;
                return (
                  <button
                    key={batchId}
                    onClick={() => handleClusterPendingBatch(batchId)}
                    disabled={clusteringBatchId !== null}
                  >
                    {isClustering
                      ? "Clustering…"
                      : `New batch · ${batch ? new Date(batch.createdAt).toLocaleString() : batchId}`}
                  </button>
                );
              })}
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
          </div>
          <div className={styles.canvas}>
            <ReactFlow nodes={displayNodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={handleNodesChange} onNodeDrag={handleNodeDrag} onNodeDragStop={handleNodeDragStop} />
          </div>
          <pre>{JSON.stringify({ workspace, batches, selectedBatchId: effectiveSelectedBatchId, batchData }, null, 2)}</pre>
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
