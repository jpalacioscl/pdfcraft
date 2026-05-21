/**
 * Conditional Branch Types for Workflow
 * Provides conditional logic support for the workflow editor.
 */

export type ConditionType =
    | 'file-count'      // Based on number of files
    | 'file-size'       // Based on total file size in bytes
    | 'file-pages'      // Based on number of pages (requires async — see note)
    | 'file-format'     // Based on file extension / MIME type
    | 'metadata'        // Based on PDF metadata (requires async — see note)
    | 'custom';         // Not supported in sandboxed execution

export type ComparisonOperator =
    | 'equals'
    | 'not-equals'
    | 'greater-than'
    | 'less-than'
    | 'greater-or-equal'
    | 'less-or-equal'
    | 'contains'
    | 'not-contains'
    | 'matches';        // Regex match (case-insensitive)

export interface Condition {
    /** Type of condition */
    type: ConditionType;
    /** Field/property to check (used by 'metadata' type) */
    field?: string;
    /** Comparison operator */
    operator: ComparisonOperator;
    /** Value to compare against */
    value: string | number | boolean;
}

export interface ConditionalBranch {
    /** Branch ID */
    id: string;
    /** Branch label */
    label: string;
    /** Conditions to evaluate */
    conditions: Condition[];
    /** Target node ID if this branch is selected */
    targetNodeId: string;
    /** Priority (lower = evaluated first) */
    priority: number;
}

export interface ConditionalNodeData {
    /** 'any' = OR logic, 'all' = AND logic across conditions */
    logic: 'any' | 'all';
    /** Branches to evaluate in priority order */
    branches: ConditionalBranch[];
    /** Fallback branch ID when no condition matches */
    defaultBranchId?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getFileExtension(file: File): string {
    const name = file.name.toLowerCase();
    const dot = name.lastIndexOf('.');
    return dot !== -1 ? name.slice(dot + 1) : '';
}

function compareValues(
    actual: string | number | boolean | undefined,
    operator: ComparisonOperator,
    expected: string | number | boolean
): boolean {
    if (actual === undefined || actual === null) return false;

    switch (operator) {
        case 'equals':
            // Try numeric equality first, then string (case-insensitive)
            if (typeof actual === 'number' || typeof expected === 'number') {
                return Number(actual) === Number(expected);
            }
            return String(actual).toLowerCase() === String(expected).toLowerCase();

        case 'not-equals':
            if (typeof actual === 'number' || typeof expected === 'number') {
                return Number(actual) !== Number(expected);
            }
            return String(actual).toLowerCase() !== String(expected).toLowerCase();

        case 'greater-than':
            return Number(actual) > Number(expected);

        case 'less-than':
            return Number(actual) < Number(expected);

        case 'greater-or-equal':
            return Number(actual) >= Number(expected);

        case 'less-or-equal':
            return Number(actual) <= Number(expected);

        case 'contains':
            return String(actual).toLowerCase().includes(String(expected).toLowerCase());

        case 'not-contains':
            return !String(actual).toLowerCase().includes(String(expected).toLowerCase());

        case 'matches':
            try {
                return new RegExp(String(expected), 'i').test(String(actual));
            } catch {
                return false;
            }

        default:
            return false;
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a single condition against an array of input files.
 *
 * Note: 'file-pages' and 'metadata' conditions require async PDF loading and
 * will always return false here. Use metadata passed via workflow node outputs
 * or pre-compute these values before branching.
 */
export function evaluateCondition(
    condition: Condition,
    files: File[]
): boolean {
    const { type, operator, value } = condition;

    switch (type) {
        case 'file-count':
            return compareValues(files.length, operator, value);

        case 'file-size': {
            const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
            return compareValues(totalBytes, operator, value);
        }

        case 'file-format': {
            if (files.length === 0) return false;
            const expected = String(value).toLowerCase().replace(/^\./, '');

            if (operator === 'equals' || operator === 'not-equals') {
                const anyMatch = files.some(f => getFileExtension(f) === expected);
                return operator === 'equals' ? anyMatch : !anyMatch;
            }

            // For other operators compare first file's extension as a string
            const firstExt = getFileExtension(files[0]);
            return compareValues(firstExt, operator, value);
        }

        case 'file-pages':
            // Requires async PDF loading — cannot evaluate synchronously.
            console.warn('[Conditional] file-pages requires async evaluation; always returns false in sync context.');
            return false;

        case 'metadata':
            // Requires async PDF loading — cannot evaluate synchronously.
            console.warn('[Conditional] metadata conditions require async evaluation; always returns false in sync context.');
            return false;

        case 'custom':
            console.warn('[Conditional] custom condition type is not supported in sandboxed execution.');
            return false;

        default:
            return false;
    }
}

/**
 * Evaluate all conditions in a branch using the given logic ('any' OR / 'all' AND).
 * An empty conditions array is treated as non-matching.
 */
export function evaluateBranch(
    branch: ConditionalBranch,
    files: File[],
    logic: 'any' | 'all'
): boolean {
    if (branch.conditions.length === 0) return false;

    return logic === 'any'
        ? branch.conditions.some(cond => evaluateCondition(cond, files))
        : branch.conditions.every(cond => evaluateCondition(cond, files));
}

/**
 * Select the appropriate branch based on the given files.
 * Branches are evaluated in ascending priority order.
 * Returns the targetNodeId of the first matching branch, or defaultBranchId if none match.
 */
export function selectBranch(
    branches: ConditionalBranch[],
    files: File[],
    logic: 'any' | 'all',
    defaultBranchId?: string
): string | null {
    const sorted = [...branches].sort((a, b) => a.priority - b.priority);

    for (const branch of sorted) {
        if (evaluateBranch(branch, files, logic)) {
            return branch.targetNodeId;
        }
    }

    return defaultBranchId ?? null;
}
