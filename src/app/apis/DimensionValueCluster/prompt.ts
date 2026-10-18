import { Trajectory } from "@/models/Trajectory";
import { Dimension } from "@/models/Dimension";
import { summarizeTrajectories } from "@/utils/trajectory";

export function getSystemPrompt() : string {
    return "";
}

// Stable across every dimension's classification call for the same batch of trajectories —
// kept separate from getDimensionInstructions below so it can be sent as its own,
// cache-marked content block: the model only pays full input-processing cost for it once per
// batch (cache TTL permitting), not once per dimension clustered.
export function getCacheablePrefix({
    trajectories,
    domainDescription,
} : {
    trajectories: Trajectory[];
    domainDescription?: string;
}): string {
    const trajectorySummaries = summarizeTrajectories(trajectories);

    return `
    ${domainDescription ? `Given the background information:\n    ${domainDescription}` : ''}
    The attached json describes different stages of a story by listing multiple turns of events.
    For each turn, you will be asked to determine the value of one variable.
    The value should be a truthful description of the state of the domain of the story at the moment of the turn.
    ${JSON.stringify(trajectorySummaries)}
    `;
}

// Varies per call — the one dimension being classified in this request — so it's kept out of
// the cacheable prefix above.
export function getDimensionInstructions({
    dimension,
} : {
    dimension: Dimension;
}): string {
    return `
    Determine the value of the following variable for each turn above. The value must be one of its listed possible values.
    ${JSON.stringify({ id: dimension.id, name: dimension.name, description: dimension.description, values: dimension.values })}
    Output a json list with entries corresponding to each turn, each with keys "trajectoryId", "turnId" and "value". "trajectoryId" and "turnId" must exactly match the "id" of the trajectory and the "id" of the turn as given in the attached json above. "value" should be the determined value for that turn.
    Return only the json with no explanation.
    `;
}
