import { describe, it, expect } from 'vitest';
import { ContradictionTracker } from '../../../src/domain/contradictionTracker';
import type { ManualNode } from '../../../src/domain/types';

function makeNode(version: string, text: string, branch?: string): ManualNode {
  return {
    version,
    text,
    branch: branch ?? 'default',
    next: [],
    params: {},
    condition: null,
    theme: 'plain',
  } as ManualNode;
}

describe('ContradictionTracker', () => {
  it('should initialize with empty contradictions', () => {
    const tracker = new ContradictionTracker();
    expect(tracker.getContradictions()).toEqual([]);
    expect(tracker.hasContradictions()).toBe(false);
  });

  it('should detect contradictory manual versions', () => {
    const tracker = new ContradictionTracker();
    const node1 = makeNode('1.0', 'Choose path A');
    const node2 = makeNode('1.0', 'Choose path B');
    
    tracker.addManual(node1);
    tracker.addManual(node2);
    
    const contradictions = tracker.getContradictions();
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].versions).toEqual(['1.0']);
    expect(tracker.hasContradictions()).toBe(true);
  });

  it('should not flag consistent manuals as contradictions', () => {
    const tracker = new ContradictionTracker();
    const node1 = makeNode('1.0', 'Follow instructions carefully');
    const node2 = makeNode('1.0', 'Follow instructions carefully');
    
    tracker.addManual(node1);
    tracker.addManual(node2);
    
    expect(tracker.hasContradictions()).toBe(false);
  });

  it('should handle multiple contradictions', () => {
    const tracker = new ContradictionTracker();
    
    tracker.addManual(makeNode('1.0', 'Version A text'));
    tracker.addManual(makeNode('1.0', 'Version B text'));
    tracker.addManual(makeNode('2.0', 'Version C text'));
    tracker.addManual(makeNode('2.0', 'Version D text'));
    
    const contradictions = tracker.getContradictions();
    expect(contradictions).toHaveLength(2);
  });

  it('should track version history', () => {
    const tracker = new ContradictionTracker();
    const node = makeNode('1.0', 'Initial manual');
    
    tracker.addManual(node);
    tracker.addManual(makeNode('1.1', 'Updated manual'));
    
    expect(tracker.getVersionCount()).toBe(2);
  });

  it('should clear contradictions', () => {
    const tracker = new ContradictionTracker();
    tracker.addManual(makeNode('1.0', 'Text A'));
    tracker.addManual(makeNode('1.0', 'Text B'));
    
    expect(tracker.hasContradictions()).toBe(true);
    
    tracker.clear();
    expect(tracker.hasContradictions()).toBe(false);
    expect(tracker.getContradictions()).toEqual([]);
  });
});