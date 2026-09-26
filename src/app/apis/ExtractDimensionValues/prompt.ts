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
    dimensions: Pick<Dimension, "name" | "description" | "values">[];
    domainDescription?: string;
}): string {

    const trajectorySummaries = summarizeTrajectories(trajectories);
    const dimensionDescriptions = dimensions.map((dimension) => ({
        name: dimension.name,
        description: dimension.description,
        existingValues: dimension.values,
    }));

    return `
    ${domainDescription ? `Given the background information:\n    ${domainDescription}` : ''}
    The attached json includes textural description of several transition trajectories of states from an Markov Decision Process (MDP).
    The state space of this MDP is defined by the following variables. Each may already have a list of "existingValues" that are known and already in use.
    ${JSON.stringify(dimensionDescriptions)}
    Based on the trajectories, determine additional reasonable possible values for each variable that are distinct from its "existingValues" and are not redundant with them. If a variable's "existingValues" already fully cover the possibilities observed in the trajectories, return an empty list of values for it.
    Format your answer as a json list of variables. Each variable should be associated with keys "name" and "values" (containing only the new values, not the "existingValues"), where "name" matches one of the variable names given above.
    Return only the json with no explanation.
    ${JSON.stringify(trajectorySummaries)}
    `;
}
