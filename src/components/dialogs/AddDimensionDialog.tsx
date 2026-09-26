'use client';
import { useState } from "react";

import "../styles/dialog.css";

export type AddDimensionInput = {
    name: string;
    description: string;
    values: string[];
};

type Props = {
    onSubmit: (input: AddDimensionInput) => void;
    onCancel: () => void;
};

export default function AddDimensionDialog({ onSubmit, onCancel }: Props) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [valuesInput, setValuesInput] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedName = name.trim();
        if (!trimmedName) return;

        const values = valuesInput
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);

        onSubmit({ name: trimmedName, description: description.trim(), values });
    };

    return (
        <div className="dialog-overlay" onClick={onCancel}>
            <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
                <h2>Add dimension</h2>
                <label>
                    Name
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        required
                    />
                </label>
                <label>
                    Description
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                    />
                </label>
                <label>
                    Values (comma-separated, optional)
                    <input
                        type="text"
                        value={valuesInput}
                        onChange={(e) => setValuesInput(e.target.value)}
                        placeholder="Leave blank to let extraction fill these in later"
                    />
                </label>
                <div className="dialog-actions">
                    <button type="button" onClick={onCancel}>Cancel</button>
                    <button type="submit">Add</button>
                </div>
            </form>
        </div>
    );
}
