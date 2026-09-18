import { Trajectory } from "@/models/Trajectory";
import { Dimension } from "@/models/Dimension";
import { summarizeTrajectories } from "@/utils/trajectory";

export function getSystemPrompt() : string {
    return "";
}

export function getPrompt({
    trajectories,
    dimensions,
    domainDescription
} : {
    trajectories: Trajectory[];
    dimensions: Pick<Dimension, "name" | "description">[];
    domainDescription?: string;
}): string {

    const trajectorySummaries = summarizeTrajectories(trajectories);

    return `
    ${domainDescription ? `Given the background information:\n    ${domainDescription}` : ''}
    The attached json includes textural description of several transition trajectories of states from an Markov Decision Process (MDP).
    The state space of this MDP is defined by the following variables:
    ${JSON.stringify(dimensions)}
    Based on the trajectories, determine a reasonable set of possible values for each variable.
    Format your answer as a json list of variables. Each variable should be associated with keys "name" and "values", where "name" matches one of the variable names given above.
    Return only the json with no explanation.
    ${JSON.stringify(trajectorySummaries)}
    `;
}
