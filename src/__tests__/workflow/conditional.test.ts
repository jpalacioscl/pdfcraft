/**
 * Tests for workflow conditional evaluation logic.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    evaluateCondition,
    evaluateBranch,
    selectBranch,
    type Condition,
    type ConditionalBranch,
} from '@/types/workflow-conditional';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, sizeBytes = 1024, mimeType = 'application/pdf'): File {
    const content = new Uint8Array(sizeBytes);
    return new File([content], name, { type: mimeType });
}

function makeCondition(
    type: Condition['type'],
    operator: Condition['operator'],
    value: string | number | boolean,
    field?: string
): Condition {
    return { type, operator, value, field };
}

function makeBranch(
    id: string,
    conditions: Condition[],
    targetNodeId: string,
    priority = 0
): ConditionalBranch {
    return { id, label: id, conditions, targetNodeId, priority };
}

// ---------------------------------------------------------------------------
// evaluateCondition — file-count
// ---------------------------------------------------------------------------

describe('evaluateCondition – file-count', () => {
    const files = [makeFile('a.pdf'), makeFile('b.pdf'), makeFile('c.pdf')];

    it('equals: matches exact count', () => {
        expect(evaluateCondition(makeCondition('file-count', 'equals', 3), files)).toBe(true);
        expect(evaluateCondition(makeCondition('file-count', 'equals', 2), files)).toBe(false);
    });

    it('not-equals', () => {
        expect(evaluateCondition(makeCondition('file-count', 'not-equals', 2), files)).toBe(true);
        expect(evaluateCondition(makeCondition('file-count', 'not-equals', 3), files)).toBe(false);
    });

    it('greater-than', () => {
        expect(evaluateCondition(makeCondition('file-count', 'greater-than', 2), files)).toBe(true);
        expect(evaluateCondition(makeCondition('file-count', 'greater-than', 3), files)).toBe(false);
    });

    it('less-than', () => {
        expect(evaluateCondition(makeCondition('file-count', 'less-than', 4), files)).toBe(true);
        expect(evaluateCondition(makeCondition('file-count', 'less-than', 3), files)).toBe(false);
    });

    it('greater-or-equal', () => {
        expect(evaluateCondition(makeCondition('file-count', 'greater-or-equal', 3), files)).toBe(true);
        expect(evaluateCondition(makeCondition('file-count', 'greater-or-equal', 4), files)).toBe(false);
    });

    it('less-or-equal', () => {
        expect(evaluateCondition(makeCondition('file-count', 'less-or-equal', 3), files)).toBe(true);
        expect(evaluateCondition(makeCondition('file-count', 'less-or-equal', 2), files)).toBe(false);
    });

    it('empty file list', () => {
        expect(evaluateCondition(makeCondition('file-count', 'equals', 0), [])).toBe(true);
        expect(evaluateCondition(makeCondition('file-count', 'greater-than', 0), [])).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// evaluateCondition — file-size
// ---------------------------------------------------------------------------

describe('evaluateCondition – file-size', () => {
    // Each file is 1024 bytes → total = 2048
    const files = [makeFile('a.pdf', 1024), makeFile('b.pdf', 1024)];

    it('equals total size', () => {
        expect(evaluateCondition(makeCondition('file-size', 'equals', 2048), files)).toBe(true);
        expect(evaluateCondition(makeCondition('file-size', 'equals', 1024), files)).toBe(false);
    });

    it('greater-than', () => {
        expect(evaluateCondition(makeCondition('file-size', 'greater-than', 1000), files)).toBe(true);
        expect(evaluateCondition(makeCondition('file-size', 'greater-than', 2048), files)).toBe(false);
    });

    it('less-than', () => {
        expect(evaluateCondition(makeCondition('file-size', 'less-than', 3000), files)).toBe(true);
        expect(evaluateCondition(makeCondition('file-size', 'less-than', 2048), files)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// evaluateCondition — file-format
// ---------------------------------------------------------------------------

describe('evaluateCondition – file-format', () => {
    const pdfFiles = [makeFile('doc.pdf', 512, 'application/pdf')];
    const mixed = [makeFile('img.png', 512, 'image/png'), makeFile('doc.pdf', 512, 'application/pdf')];

    it('equals: detects correct extension (with dot prefix)', () => {
        expect(evaluateCondition(makeCondition('file-format', 'equals', '.pdf'), pdfFiles)).toBe(true);
        expect(evaluateCondition(makeCondition('file-format', 'equals', 'pdf'), pdfFiles)).toBe(true);
    });

    it('equals: rejects wrong extension', () => {
        expect(evaluateCondition(makeCondition('file-format', 'equals', 'docx'), pdfFiles)).toBe(false);
    });

    it('not-equals', () => {
        expect(evaluateCondition(makeCondition('file-format', 'not-equals', 'docx'), pdfFiles)).toBe(true);
        expect(evaluateCondition(makeCondition('file-format', 'not-equals', 'pdf'), pdfFiles)).toBe(false);
    });

    it('equals: true if ANY file in the list matches', () => {
        expect(evaluateCondition(makeCondition('file-format', 'equals', 'png'), mixed)).toBe(true);
        expect(evaluateCondition(makeCondition('file-format', 'equals', 'pdf'), mixed)).toBe(true);
    });

    it('empty file list returns false', () => {
        expect(evaluateCondition(makeCondition('file-format', 'equals', 'pdf'), [])).toBe(false);
    });

    it('contains operator on first file extension', () => {
        expect(evaluateCondition(makeCondition('file-format', 'contains', 'pd'), pdfFiles)).toBe(true);
        expect(evaluateCondition(makeCondition('file-format', 'contains', 'xyz'), pdfFiles)).toBe(false);
    });

    it('matches operator (regex)', () => {
        expect(evaluateCondition(makeCondition('file-format', 'matches', '^pd'), pdfFiles)).toBe(true);
        expect(evaluateCondition(makeCondition('file-format', 'matches', '^doc'), pdfFiles)).toBe(false);
    });

    it('invalid regex does not throw — returns false', () => {
        expect(() => evaluateCondition(makeCondition('file-format', 'matches', '[invalid'), pdfFiles)).not.toThrow();
        expect(evaluateCondition(makeCondition('file-format', 'matches', '[invalid'), pdfFiles)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// evaluateCondition — async-only types (file-pages, metadata, custom)
// ---------------------------------------------------------------------------

describe('evaluateCondition – async-only types', () => {
    const files = [makeFile('a.pdf')];

    it('file-pages always returns false (requires async)', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(evaluateCondition(makeCondition('file-pages', 'equals', 5), files)).toBe(false);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('metadata always returns false (requires async)', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(evaluateCondition(makeCondition('metadata', 'equals', 'Author'), files)).toBe(false);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('custom always returns false', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(evaluateCondition(makeCondition('custom', 'equals', 'anything'), files)).toBe(false);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// evaluateBranch
// ---------------------------------------------------------------------------

describe('evaluateBranch', () => {
    const files = [makeFile('a.pdf', 512), makeFile('b.pdf', 512)];

    const trueCond = makeCondition('file-count', 'equals', 2);
    const falseCond = makeCondition('file-count', 'equals', 99);

    it('AND logic: all conditions must pass', () => {
        const branch = makeBranch('b1', [trueCond, trueCond], 'n2');
        expect(evaluateBranch(branch, files, 'all')).toBe(true);

        const branch2 = makeBranch('b2', [trueCond, falseCond], 'n2');
        expect(evaluateBranch(branch2, files, 'all')).toBe(false);
    });

    it('OR logic: at least one condition must pass', () => {
        const branch = makeBranch('b1', [trueCond, falseCond], 'n2');
        expect(evaluateBranch(branch, files, 'any')).toBe(true);

        const branch2 = makeBranch('b2', [falseCond, falseCond], 'n2');
        expect(evaluateBranch(branch2, files, 'any')).toBe(false);
    });

    it('empty conditions always return false', () => {
        const branch = makeBranch('b1', [], 'n2');
        expect(evaluateBranch(branch, files, 'all')).toBe(false);
        expect(evaluateBranch(branch, files, 'any')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// selectBranch
// ---------------------------------------------------------------------------

describe('selectBranch', () => {
    const singleFile = [makeFile('x.pdf', 100)];

    const branchCount1 = makeBranch(
        'count-is-1',
        [makeCondition('file-count', 'equals', 1)],
        'node-A',
        1
    );
    const branchCount2 = makeBranch(
        'count-is-2',
        [makeCondition('file-count', 'equals', 2)],
        'node-B',
        2
    );
    const branchDefault = makeBranch(
        'fallback',
        [makeCondition('file-count', 'equals', 99)],
        'node-C',
        3
    );

    it('returns the targetNodeId of the first matching branch', () => {
        const result = selectBranch([branchCount1, branchCount2], singleFile, 'all');
        expect(result).toBe('node-A');
    });

    it('returns defaultBranchId when no branch matches', () => {
        const twoFiles = [makeFile('a.pdf'), makeFile('b.pdf')];
        const result = selectBranch([branchCount1], twoFiles, 'all', 'default-node');
        expect(result).toBe('default-node');
    });

    it('returns null when nothing matches and no default', () => {
        const twoFiles = [makeFile('a.pdf'), makeFile('b.pdf')];
        const result = selectBranch([branchCount1], twoFiles, 'all');
        expect(result).toBeNull();
    });

    it('respects priority order (lower number = higher priority)', () => {
        const highPriority = makeBranch(
            'high',
            [makeCondition('file-count', 'equals', 1)],
            'node-HIGH',
            1
        );
        const lowPriority = makeBranch(
            'low',
            [makeCondition('file-count', 'equals', 1)],
            'node-LOW',
            10
        );
        // Both match — highest priority (lowest number) wins
        const result = selectBranch([lowPriority, highPriority], singleFile, 'all');
        expect(result).toBe('node-HIGH');
    });

    it('returns null for empty branch list', () => {
        expect(selectBranch([], singleFile, 'all')).toBeNull();
        expect(selectBranch([], singleFile, 'all', 'default-node')).toBe('default-node');
    });

    it('OR logic selects correctly', () => {
        const branch = makeBranch(
            'or-branch',
            [
                makeCondition('file-count', 'equals', 99), // false
                makeCondition('file-count', 'equals', 1),  // true
            ],
            'node-OR',
            1
        );
        expect(selectBranch([branch], singleFile, 'any')).toBe('node-OR');
    });

    it('AND logic fails when not all conditions pass', () => {
        const branch = makeBranch(
            'and-branch',
            [
                makeCondition('file-count', 'equals', 1),   // true
                makeCondition('file-count', 'equals', 99),  // false
            ],
            'node-AND',
            1
        );
        expect(selectBranch([branch], singleFile, 'all', 'default-node')).toBe('default-node');
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
    it('handles file with no extension', () => {
        const noExt = [makeFile('nodotfile', 100)];
        expect(evaluateCondition(makeCondition('file-format', 'equals', 'pdf'), noExt)).toBe(false);
        expect(evaluateCondition(makeCondition('file-format', 'equals', ''), noExt)).toBe(true);
    });

    it('file-size with zero-byte file', () => {
        const empty = [makeFile('empty.pdf', 0)];
        expect(evaluateCondition(makeCondition('file-size', 'equals', 0), empty)).toBe(true);
        expect(evaluateCondition(makeCondition('file-size', 'greater-than', 0), empty)).toBe(false);
    });

    it('numeric string values are coerced correctly', () => {
        const files = [makeFile('a.pdf'), makeFile('b.pdf')];
        // Value given as string "2" should still match numeric count 2
        expect(evaluateCondition(makeCondition('file-count', 'equals', '2' as unknown as number), files)).toBe(true);
    });
});
