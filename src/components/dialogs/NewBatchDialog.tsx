'use client';
import "../styles/dialog.css";

type Props = {
    onConfirm: () => void;
    onCancel: () => void;
};

export default function NewBatchDialog({ onConfirm, onCancel }: Props) {
    return (
        <div className="dialog-overlay" onClick={onCancel}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <h2>New batch of trajectories received</h2>
                <p>Show them on the editor?</p>
                <div className="dialog-actions">
                    <button type="button" onClick={onCancel}>No</button>
                    <button type="button" onClick={onConfirm}>Yes</button>
                </div>
            </div>
        </div>
    );
}
