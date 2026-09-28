export function randomColor(): string {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 50%)`;
}

// Opacity applied to a TrajectoryMoment marker when it IS in highlightedTrajectoryMoments
// (or when nothing is highlighted at all, since then every moment counts as highlighted).
export const HIGHLIGHTED_OPACITY = 0.6;

// Opacity applied to a TrajectoryMoment marker when it is NOT in highlightedTrajectoryMoments.
export const NON_HIGHLIGHTED_OPACITY = 0.2;
