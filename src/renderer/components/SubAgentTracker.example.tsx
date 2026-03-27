/*
 * Example usage of SubAgentTracker component
 *
 * This file demonstrates how to integrate the SubAgentTracker into your application
 * to monitor parallel agent execution progress.
 */

import { useState, useEffect } from 'react';
import { SubAgentTracker, SubAgent } from './SubAgentTracker';

/**
 * Example: SubAgentTracker in a parent component
 */
export function AgentMonitorExample() {
  const [agents, setAgents] = useState<SubAgent[]>([]);

  // Example: Simulate parallel agent execution
  useEffect(() => {
    // Create initial agents
    const initialAgents: SubAgent[] = [
      {
        id: 'agent-1',
        description: 'Analyze codebase architecture',
        status: 'running',
        tokensUsed: 1250,
        startTime: new Date(Date.now() - 5000),
      },
      {
        id: 'agent-2',
        description: 'Search for security vulnerabilities',
        status: 'pending',
        tokensUsed: 0,
        startTime: new Date(),
      },
      {
        id: 'agent-3',
        description: 'Generate test coverage report',
        status: 'running',
        tokensUsed: 3400,
        startTime: new Date(Date.now() - 10000),
        output: 'Found 47 test files, calculating coverage metrics...',
      },
    ];

    setAgents(initialAgents);

    // Simulate agent progress updates
    const interval = setInterval(() => {
      setAgents(prev => prev.map(agent => {
        if (agent.status === 'running') {
          // Simulate token usage growth
          const newTokens = agent.tokensUsed + Math.floor(Math.random() * 200);

          // Randomly complete some agents
          if (Math.random() > 0.95) {
            return {
              ...agent,
              status: 'completed' as const,
              tokensUsed: newTokens,
              endTime: new Date(),
              output: 'Task completed successfully',
            };
          }

          // Randomly fail some agents
          if (Math.random() > 0.98) {
            return {
              ...agent,
              status: 'error' as const,
              tokensUsed: newTokens,
              endTime: new Date(),
              error: 'Connection timeout',
            };
          }

          return {
            ...agent,
            tokensUsed: newTokens,
            output: `Processing... ${newTokens} tokens used`,
          };
        }

        if (agent.status === 'pending') {
          // Start pending agents
          if (Math.random() > 0.7) {
            return {
              ...agent,
              status: 'running' as const,
            };
          }
        }

        return agent;
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <SubAgentTracker agents={agents} />
    </div>
  );
}

/**
 * Example: Integration with agent loop system
 *
 * This shows how to connect SubAgentTracker to the actual agent execution system.
 */
export function AgentTrackerIntegration() {
  const [agents, setAgents] = useState<SubAgent[]>([]);

  // Listen to agent events from the agent loop
  useEffect(() => {
    const handleAgentStart = (event: { agentId: string; description: string }) => {
      const newAgent: SubAgent = {
        id: event.agentId,
        description: event.description,
        status: 'running',
        tokensUsed: 0,
        startTime: new Date(),
      };

      setAgents(prev => [...prev, newAgent]);
    };

    const handleAgentProgress = (event: { agentId: string; tokensUsed: number; output?: string }) => {
      setAgents(prev => prev.map(agent =>
        agent.id === event.agentId
          ? { ...agent, tokensUsed: event.tokensUsed, output: event.output }
          : agent
      ));
    };

    const handleAgentComplete = (event: { agentId: string; output: string }) => {
      setAgents(prev => prev.map(agent =>
        agent.id === event.agentId
          ? {
              ...agent,
              status: 'completed',
              endTime: new Date(),
              output: event.output,
            }
          : agent
      ));
    };

    const handleAgentError = (event: { agentId: string; error: string }) => {
      setAgents(prev => prev.map(agent =>
        agent.id === event.agentId
          ? {
              ...agent,
              status: 'error',
              endTime: new Date(),
              error: event.error,
            }
          : agent
      ));
    };

    // Subscribe to agent events (pseudo-code)
    // eventBus.on('agent:start', handleAgentStart);
    // eventBus.on('agent:progress', handleAgentProgress);
    // eventBus.on('agent:complete', handleAgentComplete);
    // eventBus.on('agent:error', handleAgentError);

    return () => {
      // Cleanup subscriptions
      // eventBus.off('agent:start', handleAgentStart);
      // eventBus.off('agent:progress', handleAgentProgress);
      // eventBus.off('agent:complete', handleAgentComplete);
      // eventBus.off('agent:error', handleAgentError);
    };
  }, []);

  return <SubAgentTracker agents={agents} />;
}
