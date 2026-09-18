import { Trajectory } from "@/models/Trajectory";

export function getSystemPrompt() : string {
    return "";
}

export function getPrompt({
    numDimensions,
    trajectories,
    domainDescription
} : {
    numDimensions: number;
    trajectories: Trajectory[];
    domainDescription?: string;
}): string {

    const trajectorySummaries = trajectories.map((trajectory) => ({
        id: trajectory.id,
        turnSummaries: trajectory.turns.map((turn) => ({
            id: turn.id,
            summary: turn.summary,
        })),
    }));

    return `
    The attached json includes textural description of several transition trajectories of states from an Markov Decision Process (MDP).
    ${domainDescription ? `Domain description: ${domainDescription}` : ''}
    Based on the trajectories, what do you think could be the ${numDimensions} variables that best define the state space of the MDP? And for each variable what should be their value range?  Format your answer as a json list of variables. Each variable should be associated with keys "id", "name", "description" and "values". Return only the json with no explanation.
    ${JSON.stringify(trajectorySummaries)}
    `;
}