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
    dimensions: Dimension[];
    domainDescription?: string;
}): string {

    const trajectorySummaries = summarizeTrajectories(trajectories);
    const dimensionDescriptions = dimensions.map((dimension) => ({
        id: dimension.id,
        name: dimension.name,
        description: dimension.description,
        values: dimension.values,
    }));

    return `
    ${domainDescription ? `Given the background information:\n    ${domainDescription}` : ''}
    The attached json describes different stages of a story by listing multiple turns of events.
    For each turn, determine the value of each of the following variables. Each variable's value must be one of its listed possible values.
    ${JSON.stringify(dimensionDescriptions)}
    The value should be a truthful description of the state of the domain of the story at the moment of the turn.
    Output a json list with entries corresponding to each turn, each with keys "turnId" and "values". "values" should be an object mapping each variable's "id" to its determined value for that turn.
    Return only the json with no explanation.
    ${JSON.stringify(trajectorySummaries)}
    `;
}