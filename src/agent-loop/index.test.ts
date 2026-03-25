/*
 * Path: /Users/ghost/Desktop/aiterminal/src/agent-loop/index.test.ts
 * Module: agent-loop
 * Purpose: Unit tests for agent loop - classifier, basic routing
 * Dependencies: vitest
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/index.ts
 * Keywords: tests, classifier, routing
 * Last Updated: 2026-03-24
 */

import { describe, it, expect } from 'vitest';
import { classifyTask, shouldChainInterns, getNextIntern } from './classifier.js';

describe('Task Classifier', () => {
  describe('Dev tasks (Mei)', () => {
    it('should route coding tasks to Mei', () => {
      const result = classifyTask('Fix the login bug');
      expect(result.intern).toBe('mei');
      expect(result.confidence).toBe('high');
    });

    it('should route test tasks to Mei', () => {
      const result = classifyTask('Write tests for the auth module');
      expect(result.intern).toBe('mei');
      expect(result.confidence).toBe('high');
    });

    it('should route refactor tasks to Mei', () => {
      const result = classifyTask('Refactor the API layer');
      expect(result.intern).toBe('mei');
      expect(result.confidence).toBe('high');
    });
  });

  describe('Research tasks (Sora)', () => {
    it('should route research tasks to Sora', () => {
      const result = classifyTask('Research the best practices for PostgreSQL indexing');
      expect(result.intern).toBe('sora');
      expect(result.confidence).toBe('high');
    });

    it('should route comparison tasks to Sora', () => {
      const result = classifyTask('Compare React vs Vue for our project');
      expect(result.intern).toBe('sora');
      expect(result.confidence).toBe('high');
    });

    it('should route "how to" questions to Sora', () => {
      const result = classifyTask('How does OAuth 2.0 work?');
      expect(result.intern).toBe('sora');
      expect(result.confidence).toBe('high');
    });
  });

  describe('Content tasks (Hana)', () => {
    it('should route blog writing to Hana', () => {
      const result = classifyTask('Write a blog post about our new feature');
      expect(result.intern).toBe('hana');
      expect(result.confidence).toBe('high');
    });

    it('should route tweet drafting to Hana', () => {
      const result = classifyTask('Draft a tweet announcing the launch');
      expect(result.intern).toBe('hana');
      expect(result.confidence).toBe('high');
    });

    it('should route documentation to Hana', () => {
      const result = classifyTask('Update the README with new installation instructions');
      expect(result.intern).toBe('hana');
      expect(result.confidence).toBe('high');
    });
  });

  describe('Multi-domain chains', () => {
    it('should detect Research + Dev chain', () => {
      const result = classifyTask('Research how to implement OAuth and then code it');
      expect(result.intern).toBe('sora');
      expect(result.suggestedChains).toEqual(['sora', 'mei']);
    });

    it('should detect Research + Content chain', () => {
      const result = classifyTask('Research this topic and write a blog post');
      expect(result.intern).toBe('sora');
      expect(result.suggestedChains).toEqual(['sora', 'hana']);
    });

    it('should detect Dev + Documentation chain', () => {
      const result = classifyTask('Implement this feature and document it');
      expect(result.intern).toBe('mei');
      expect(result.suggestedChains).toEqual(['mei', 'hana']);
    });
  });

  describe('Ambiguous tasks', () => {
    it('should default to Sora for unclear tasks', () => {
      const result = classifyTask('help me with this thing');
      expect(result.intern).toBe('sora');
      expect(result.confidence).toBe('low');
    });
  });
});

describe('Intern chaining', () => {
  it('should detect when chaining is needed', () => {
    const classification = classifyTask('Research and implement OAuth');
    expect(shouldChainInterns(classification)).toBe(true);
  });

  it('should return null when at end of chain', () => {
    const next = getNextIntern('hana', ['sora', 'mei', 'hana']);
    expect(next).toBeNull();
  });

  it('should return next intern in chain', () => {
    const next = getNextIntern('sora', ['sora', 'mei', 'hana']);
    expect(next).toBe('mei');
  });

  it('should return null for intern not in chain', () => {
    const next = getNextIntern('mei', ['sora', 'hana']);
    expect(next).toBeNull();
  });
});
