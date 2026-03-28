/**
 * useElevenLabsAgent — wraps @elevenlabs/react useConversation for RP mode.
 * Manages the live voice conversation session with the ElevenLabs agent.
 */

import { useConversation } from '@elevenlabs/react';
import { useState, useCallback, useRef } from 'react';

const AGENT_ID = 'agent_8301kmtt7yk4eppv568q9qezypem';

export interface AgentMessage {
  readonly role: 'user' | 'agent';
  readonly text: string;
  readonly timestamp: number;
}

export interface UseElevenLabsAgentReturn {
  /** Connection status */
  readonly status: string;
  /** Whether the agent is currently speaking */
  readonly isSpeaking: boolean;
  /** Conversation transcript */
  readonly messages: ReadonlyArray<AgentMessage>;
  /** Start the voice conversation */
  readonly start: () => Promise<void>;
  /** End the voice conversation */
  readonly stop: () => Promise<void>;
  /** Send a text message (typed input) */
  readonly sendText: (text: string) => void;
  /** Send contextual update (doesn't trigger response) */
  readonly sendContext: (text: string) => void;
  /** Current conversation ID */
  readonly conversationId: string | null;
}

export function useElevenLabsAgent(): UseElevenLabsAgentReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationRef = useRef<ReturnType<typeof useConversation> | null>(null);

  const conversation = useConversation({
    onConnect: () => {
      console.log('[ElevenLabsAgent] Connected');
    },
    onDisconnect: () => {
      console.log('[ElevenLabsAgent] Disconnected');
      setConversationId(null);
    },
    onMessage: (message) => {
      console.log('[ElevenLabsAgent] Message:', message);
      // Message has { source: 'user' | 'ai', message: string }
      const msg = message as { source?: string; message?: string };
      if (msg.message) {
        setMessages(prev => [...prev, {
          role: msg.source === 'ai' ? 'agent' : 'user',
          text: msg.message!,
          timestamp: Date.now(),
        }]);
        // Note: do NOT dispatch ai-response event here — the ElevenLabs agent
        // handles its own audio output. Dispatching would cause double playback.
      }
    },
    onError: (error) => {
      console.error('[ElevenLabsAgent] Error:', error);
    },
  });

  // Store ref for text methods
  conversationRef.current = conversation;

  const start = useCallback(async () => {
    try {
      // Request microphone access first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      await conversation.startSession({
        agentId: AGENT_ID,
      });

      const id = conversation.getId();
      if (id) setConversationId(id);
      setMessages([]);
    } catch (err) {
      console.error('[ElevenLabsAgent] Failed to start:', err);
    }
  }, [conversation]);

  const stop = useCallback(async () => {
    try {
      await conversation.endSession();
      setConversationId(null);
    } catch (err) {
      console.error('[ElevenLabsAgent] Failed to stop:', err);
    }
  }, [conversation]);

  const sendText = useCallback((text: string) => {
    if (conversationRef.current) {
      conversationRef.current.sendUserMessage(text);
      setMessages(prev => [...prev, {
        role: 'user',
        text,
        timestamp: Date.now(),
      }]);
    }
  }, []);

  const sendContext = useCallback((text: string) => {
    conversationRef.current?.sendContextualUpdate(text);
  }, []);

  return {
    status: conversation.status,
    isSpeaking: conversation.isSpeaking,
    messages,
    start,
    stop,
    sendText,
    sendContext,
    conversationId,
  };
}
