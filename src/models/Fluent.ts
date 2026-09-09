export type FluentId = string;

export type Fluent = {
    id: FluentId;
    name: string;
    description: string;
    values: string[];
    composedOf?: FluentId[];
}