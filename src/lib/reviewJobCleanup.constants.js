// Shared retention constants for ReviewJob cleanup.
// Extracted into their own module so client components can import them
// without pulling Prisma into the browser bundle.

export const DEFAULT_RETENTION_DAYS = 30;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 365;
export const TERMINAL_STATUSES = Object.freeze(['COMPLETED', 'FAILED']);
