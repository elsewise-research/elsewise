// Todo: multimodal content support

export type TrajectoryId = string;
export type TurnId = string;

export type Trajectory = {
    id: TrajectoryId;
    turns: Turn[];
};

export type Turn = {
    id: TurnId;
    steps: Step[];
    summary: string;
};

export type Step =
  | { type: "message"; subject: string; content: Message }
  | { type: "action"; subject: string; content: Action };

export type Message = {
    content: string;
};

export type Action = {
    actionName: string;
    actionArgs: Record<string, unknown>;
};

