import { Trajectory } from "@/models/Trajectory";
import { Dimension } from "@/models/Dimension";
import { summarizeTrajectories } from "@/utils/trajectory";

export function getSystemPrompt() : string {
    return "";
}

export function getPrompt({
    numDimensions,
    trajectories,
    domainDescription,
    existingDimensions
} : {
    numDimensions: number;
    trajectories: Trajectory[];
    domainDescription?: string;
    existingDimensions?: Pick<Dimension, "name" | "description">[];
}): string {

    const trajectorySummaries = summarizeTrajectories(trajectories);

    return `
    The attached json includes textural description of several transition trajectories of states from an Markov Decision Process (MDP).
    ${domainDescription ? `Domain description: ${domainDescription}` : ''}
    ${existingDimensions && existingDimensions.length > 0
        ? `The following variables have already been identified and must NOT be repeated or duplicated in your answer:\n    ${JSON.stringify(existingDimensions)}\n`
        : ''}
    Based on the trajectories, what do you think could be ${numDimensions} additional variables${existingDimensions && existingDimensions.length > 0 ? ", distinct from the ones already identified above," : ""} that best define the state space of the MDP?
    And for each variable what should be their value range?
    Format your answer as a json list of variables.
    Each variable should be associated with keys "id", "name", "description" and "values".
    Return only the json with no explanation.
    ${JSON.stringify(trajectorySummaries)}
    `;
}