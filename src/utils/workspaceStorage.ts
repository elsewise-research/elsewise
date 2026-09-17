import { Workspace } from "@/models/Workspace";

const WORKSPACE_STORAGE_KEY = "workspace";

export function saveWorkspace(workspace: Workspace): void {
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

export function loadWorkspace(): Workspace | null {
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Workspace) : null;
}

export function clearWorkspace(): void {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
}
