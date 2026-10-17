import dynamic from "next/dynamic";
import { useState } from "react";
import { Rows3, LayoutGrid, Trash2, Group, Eye, EyeOff, Pencil, ChevronUp, ChevronDown, Plus } from "lucide-react";
import { type Node, type NodeProps } from "@xyflow/react";
import { Trajectory } from "@/models/Trajectory";
import { ValueClustering, TrajectoryMoment } from "@/models/ValueClustering";
import { HIGHLIGHTED_OPACITY, NON_HIGHLIGHTED_OPACITY } from "@/utils/color";

import "./styles/canvas.css"

const BSVDrawingCanvas = dynamic(() => import("./BSVDrawingCanvas"), { ssr: false });

type simpleBSVData = {
    dimensionName : string;
    dimensionDescription : string;
    trajectories : Trajectory[];
    valueClustering : ValueClustering;
    trajectoryColorSetting : Record<string, string>;
    compactView : boolean;
    isDropTarget? : boolean;
    onToggleCompactView : () => void;
    onDelete : () => void;
    onValueCluster : () => void;
    onMomentClick : (moment: TrajectoryMoment) => void;
    onCellClick : (moments: TrajectoryMoment[]) => void;
    currTrajectoryMoment? : TrajectoryMoment;
    highlightedTrajectoryMoments? : TrajectoryMoment[];
    isClustering? : boolean;
    showArrows : boolean;
    onToggleArrows : () => void;
    dimensionValues : string[];
    onRenameValue : (oldValue: string, newValue: string) => void;
    onDeleteValue : (value: string) => void;
    onAddValue : (value: string) => void;
    onMoveValue : (value: string, direction: "up" | "down") => void;
}

type SimpleBSV = Node<simpleBSVData, 'simpleBSV'>;

export default function SimpleBSV({data}: NodeProps<SimpleBSV>) {
    const {dimensionName,
        dimensionDescription,
        trajectories,
        valueClustering,
        trajectoryColorSetting,
        compactView,
        onToggleCompactView,
        onDelete,
        onValueCluster,
        onMomentClick,
        onCellClick,
        currTrajectoryMoment,
        highlightedTrajectoryMoments = [],
        isClustering = false,
        showArrows,
        onToggleArrows,
        dimensionValues,
        onRenameValue,
        onDeleteValue,
        onAddValue,
        onMoveValue,
        isDropTarget} = data;

    const [editingValue, setEditingValue] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState("");
    const [newValueDraft, setNewValueDraft] = useState("");

    const startEditing = (value: string) => {
        setEditingValue(value);
        setEditDraft(value);
    };

    const commitEdit = (value: string) => {
        setEditingValue(null);
        const trimmed = editDraft.trim();
        if (trimmed && trimmed !== value) onRenameValue(value, trimmed);
    };

    const commitAdd = () => {
        const trimmed = newValueDraft.trim();
        if (!trimmed) return;
        onAddValue(trimmed);
        setNewValueDraft("");
    };

    if (valueClustering.dimensionIds.length !== 1) {
        throw new Error(
            `SimpleBSV expects valueClustering.dimensionIds to contain exactly one element, got ${valueClustering.dimensionIds.length}`
        );
    }

    const turnOrderByTrajectory = new Map<string, Map<string, number>>();
    for (const trajectory of trajectories) {
        const turnOrder = new Map<string, number>();
        trajectory.turns.forEach((turn, index) => {
            turnOrder.set(turn.id, index + 1);
        });
        turnOrderByTrajectory.set(trajectory.id, turnOrder);
    }

    const getTurnOrder = (moment: TrajectoryMoment): number | undefined =>
        turnOrderByTrajectory.get(moment.trajectoryId)?.get(moment.turnId);

    const handleDeleteClick = () => {
        const confirmed = window.confirm(
            `Delete "${dimensionName}"? Any BSV that references this dimension — including combined views crossed with other dimensions — will also be deleted. This cannot be undone.`
        );
        if (confirmed) onDelete();
    };

    const isCurrTrajectoryMoment = (moment: TrajectoryMoment) =>
        currTrajectoryMoment?.trajectoryId === moment.trajectoryId
        && currTrajectoryMoment?.turnId === moment.turnId;

    // With nothing highlighted, every moment shows at full opacity; once something is
    // highlighted, only members of that set stay at full opacity and the rest dim.
    const isHighlighted = (moment: TrajectoryMoment) =>
        highlightedTrajectoryMoments.length === 0
        || highlightedTrajectoryMoments.some(
            (highlighted) => highlighted.trajectoryId === moment.trajectoryId && highlighted.turnId === moment.turnId,
        );

    const renderMoment = (moment: TrajectoryMoment) => (
        <span
            key={`${moment.trajectoryId}-${moment.turnId}`}
            className={`trajectory-moment-markor${isCurrTrajectoryMoment(moment) ? " trajectory-moment-markor--current" : ""}`}
            style={{
                backgroundColor: trajectoryColorSetting[moment.trajectoryId],
                opacity: isHighlighted(moment) ? HIGHLIGHTED_OPACITY : NON_HIGHLIGHTED_OPACITY,
            }}
            title={`trajectoryId: ${moment.trajectoryId}\nturnId: ${moment.turnId}`}
            onClick={(e) => {
                // Prevent bubbling to the containing cell's onClick, which would
                // otherwise immediately override this moment-scoped highlight.
                e.stopPropagation();
                onMomentClick(moment);
            }}
        >
            {getTurnOrder(moment)}
        </span>
    );

    const distinctTurnOrders = Array.from(
        new Set(
            Object.values(valueClustering.valueMapping)
                .flat()
                .map((moment) => getTurnOrder(moment))
                .filter((order): order is number => order !== undefined)
        )
    ).sort((a, b) => a - b);

    return (
        <div className={`bsv-node${isDropTarget ? " bsv-node--drop-target" : ""}`}>
            <div className="bsv-title">{dimensionName}</div>
            <div className="bsv-toolkit">
                <button onClick={onToggleCompactView} title={compactView ? "Switch to expanded view" : "Switch to compact view"}>
                    {compactView ? <LayoutGrid size={16} /> : <Rows3 size={16} />}
                </button>
                <button onClick={onValueCluster} title="Cluster trajectory moments based on the values">
                    <Group size={16} />
                </button>
                {!compactView && (
                    <button onClick={onToggleArrows} title={showArrows ? "Hide arrows" : "Show arrows"}>
                        {showArrows ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                )}
                <button onClick={handleDeleteClick} title="Delete this BSV">
                    <Trash2 size={16} />
                </button>
            </div>
            <div className="bsv-description">{dimensionDescription}</div>
            <div className="bsv-viz nodrag">
            {isClustering ? (
                <p>Clustering in progress...</p>
            ) : compactView ? (
                <table className="bsv-table">
                    <tbody>
                        {dimensionValues.map((value, index) => {
                            const moments = valueClustering.valueMapping[value] ?? [];
                            return (
                                <tr key={value}>
                                    <td className="bsv-value-clustering" onDoubleClick={() => onCellClick(moments)}>
                                    <div className="bsv-value-label">
                                        {editingValue === value ? (
                                            <input
                                                className="bsv-value-edit-input nodrag"
                                                autoFocus
                                                value={editDraft}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => setEditDraft(e.target.value)}
                                                onBlur={() => commitEdit(value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") commitEdit(value);
                                                    if (e.key === "Escape") setEditingValue(null);
                                                }}
                                            />
                                        ) : (
                                            <p>{value}</p>
                                        )}
                                        <div className="bsv-value-actions" onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => onMoveValue(value, "up")} disabled={index === 0} title="Move value up">
                                                <ChevronUp size={12} />
                                            </button>
                                            <button onClick={() => onMoveValue(value, "down")} disabled={index === dimensionValues.length - 1} title="Move value down">
                                                <ChevronDown size={12} />
                                            </button>
                                            <button onClick={() => startEditing(value)} title="Rename value">
                                                <Pencil size={12} />
                                            </button>
                                            <button onClick={() => onDeleteValue(value)} title="Delete value">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bsv-moments">
                                        {moments.map(renderMoment)}
                                    </div>
                                    </td>
                                </tr>
                            );
                        })}
                        <tr>
                            <td className="bsv-add-value nodrag">
                                <input
                                    className="bsv-value-edit-input"
                                    placeholder="Add value"
                                    value={newValueDraft}
                                    onChange={(e) => setNewValueDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") commitAdd(); }}
                                />
                                <button onClick={commitAdd} title="Add value">
                                    <Plus size={14} />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            ) : (
                <BSVDrawingCanvas
                    values={distinctTurnOrders.map(String)}
                    columns={Object.keys(valueClustering.valueMapping)}
                    rowLabel={(row) => `step ${row}`}
                    cornerLabel="Step"
                    getCellMoments={(rowValue, columnValue) =>
                        (valueClustering.valueMapping[columnValue] ?? []).filter(
                            (moment) => getTurnOrder(moment) === Number(rowValue),
                        )
                    }
                    trajectories={trajectories}
                    trajectoryColorSetting={trajectoryColorSetting}
                    getTurnOrder={getTurnOrder}
                    onMomentClick={onMomentClick}
                    onCellClick={onCellClick}
                    showArrows={showArrows}
                    currTrajectoryMoment={currTrajectoryMoment}
                    highlightedTrajectoryMoments={highlightedTrajectoryMoments}
                />
            )}
            </div>
        </div>
    );
}
