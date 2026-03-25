/*
 * Path: /Users/ghost/Desktop/aiterminal/src/agent-loop/classifier.ts
 * Module: agent-loop
 * Purpose: Classify user tasks and route to appropriate intern (Mei, Sora, Hana)
 * Dependencies: none
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/events.ts
 * Keywords: task-classification, intern-routing, nlp-classification
 * Last Updated: 2026-03-24
 */

import type { TaskClassification } from './events.js';

/**
 * Classify a user task and determine which intern should handle it.
 * Uses keyword matching and confidence scoring.
 */
export function classifyTask(input: string): TaskClassification {
  const normalized = input.toLowerCase().trim();

  // Mei triggers (dev/coding) - use word boundaries to avoid false matches
  const meiTriggers = [
    'code', 'test', 'tests', 'testing', 'bug', 'fix', 'refactor', 'api', 'database',
    'deploy', 'stripe', 'payment', 'webhook', 'security',
    'scaffold', 'optimize', 'review code', 'pr', 'commit', 'pull request',
    'implement', 'build', 'feature', 'function', 'class', 'component',
    'debug', 'error', 'exception', 'stack trace', 'compile', 'lint',
    'cli', 'git', 'github', 'repository', 'branch', 'merge'
  ];

  // Sora triggers (research/analysis)
  const soraTriggers = [
    'research', 'compare', 'analyze', 'investigate', 'summarize',
    'look into', 'what is', 'how does', 'evaluate', 'find',
    'best practice', 'explain', 'difference between',
    'vs', 'versus', 'tutorial', 'guide', 'example of', 'how to'
  ];

  // Hana triggers (content/business)
  const hanaTriggers = [
    'write', 'blog', 'tweet', 'post', 'copy', 'draft', 'docs',
    'landing page', 'pricing', 'marketing', 'pitch', 'investor',
    'seo', 'content strategy', 'announcement', 'release notes',
    'press release', 'documentation', 'readme', 'changelog', 'document',
    'publish', 'article', 'content', 'update'
  ];

  // Count matches for each intern
  // Use simple includes() for predictability
  const meiScore = meiTriggers.filter(t => normalized.includes(t)).length;
  const soraScore = soraTriggers.filter(t => normalized.includes(t)).length;
  const hanaScore = hanaTriggers.filter(t => normalized.includes(t)).length;

  // Multi-domain detection: handle chains
  // Only chain when there are explicit action verbs for BOTH domains
  // "about", "for", "on", "regarding" indicate topic, not action → no chain
  const hasTopicIndicator = /\b(about|for|on|regarding|describing|explaining)\b/i.test(normalized);

  // Research + Dev = Sora → Mei (research first, then implement)
  // Only chain if not just "research about X" or similar
  if (meiScore > 0 && soraScore > 0 && !hasTopicIndicator) {
    return {
      intern: 'sora',
      confidence: 'high',
      reasoning: 'Research → Development chain detected',
      suggestedChains: ['sora', 'mei']
    };
  }

  // Research + Content = Sora → Hana (research then publish)
  // Only chain if not just "research about X and write about it"
  if (soraScore > 0 && hanaScore > 0 && !hasTopicIndicator) {
    return {
      intern: 'sora',
      confidence: 'high',
      reasoning: 'Research → Content publishing chain detected',
      suggestedChains: ['sora', 'hana']
    };
  }

  // Dev + Content = Mei → Hana (build then document)
  // Only chain with explicit "and document" pattern, not "about"
  const hasExplicitDocChain = /\b(and document|and write docs|then document|then write)\b/i.test(normalized);
  if (meiScore > 0 && hanaScore > 0 && hasExplicitDocChain && !hasTopicIndicator) {
    return {
      intern: 'mei',
      confidence: 'high',
      reasoning: 'Development → Documentation chain detected',
      suggestedChains: ['mei', 'hana']
    };
  }

  // Single intern routing
  const maxScore = Math.max(meiScore, soraScore, hanaScore);

  // No clear trigger - default to Sora for clarification
  if (maxScore === 0) {
    return {
      intern: 'sora',
      confidence: 'low',
      reasoning: 'No clear domain trigger detected - defaulting to research for clarification'
    };
  }

  // Handle ties: prioritize by specificity
  if (maxScore > 0) {
    const scores = { mei: meiScore, sora: soraScore, hana: hanaScore };
    const winners = Object.entries(scores).filter(([_, score]) => score === maxScore).map(([intern, _]) => intern);

    if (winners.length === 1) {
      // Clear winner
      return {
        intern: winners[0] as 'mei' | 'sora' | 'hana',
        confidence: 'high',
        reasoning: `${winners[0].charAt(0).toUpperCase() + winners[0].slice(1)} task detected`
      };
    }

    // Tie-breaking: prioritize by keyword specificity
    // Content keywords (blog, tweet, post) > dev keywords > default to sora
    const contentSpecific = ['blog', 'tweet', 'post', 'docs', 'readme', 'changelog', 'pricing', 'marketing', 'pitch', 'publish', 'article', 'content'];
    const devSpecific = ['code', 'test', 'bug', 'fix', 'api', 'database', 'deploy', 'security', 'scaffold', 'implement', 'build', 'function', 'class', 'component', 'debug', 'error'];

    const hasContentSpecific = contentSpecific.some(t => normalized.includes(t));
    const hasDevSpecific = devSpecific.some(t => normalized.includes(t));

    if (hasContentSpecific && winners.includes('hana')) {
      return {
        intern: 'hana',
        confidence: 'high',
        reasoning: 'Content task detected (specific keywords)'
      };
    }

    if (hasDevSpecific && winners.includes('mei')) {
      return {
        intern: 'mei',
        confidence: 'high',
        reasoning: 'Development task detected (specific keywords)'
      };
    }

    // Tie: default to sora for clarification
    if (winners.includes('sora')) {
      return {
        intern: 'sora',
        confidence: 'medium',
        reasoning: 'Ambiguous task - defaulting to research for clarification'
      };
    }

    // Tie: pick first winner (deterministic)
    return {
      intern: winners[0] as 'mei' | 'sora' | 'hana',
      confidence: 'medium',
      reasoning: 'Multiple domains detected - picking first match'
    };
  }

  // Fallback (shouldn't reach here)
  return {
    intern: 'sora',
    confidence: 'low',
    reasoning: 'No clear domain trigger detected - defaulting to research for clarification'
  };
}

/**
 * Check if a task should trigger multi-intern chaining.
 */
export function shouldChainInterns(classification: TaskClassification): boolean {
  return classification.suggestedChains !== undefined &&
         classification.suggestedChains.length > 1;
}

/**
 * Get the next intern in a chain.
 */
export function getNextIntern(
  currentIntern: 'mei' | 'sora' | 'hana',
  chain: ('mei' | 'sora' | 'hana')[]
): 'mei' | 'sora' | 'hana' | null {
  const currentIndex = chain.indexOf(currentIntern);
  if (currentIndex === -1 || currentIndex === chain.length - 1) {
    return null;
  }
  return chain[currentIndex + 1];
}
