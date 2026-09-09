// Todo: multimodal content support

export type TrajectoryId = string;
export type RoundId = string;

export type Trajectory = {
    id: TrajectoryId;
    rounds: Round[];
};

export type Round = {
    id: RoundId;
    turns: Turn[];
    summary: string;
};

export type Turn =
  | { type: "message"; subject: string; content: Message }
  | { type: "action"; subject: string; content: Action };

export type Message = {
    content: string;
};

export type Action = {
    actionName: string;
    actionArgs: Record<string, unknown>;
};

