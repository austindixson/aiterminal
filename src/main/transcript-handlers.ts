/*
 * Path: /Users/ghost/Desktop/aiterminal/src/main/transcript-handlers.ts
 * Module: main
 * Purpose: IPC handlers for transcript database - search, retrieval, stats
 * Dependencies: electron, ../agent-loop/transcript-db
 * Related: /Users/ghost/Desktop/aiterminal/src/agent-loop/router.ts
 * Keywords: transcript, ipc-handlers, search, session-history
 * Last Updated: 2026-03-24
 */

import { ipcMain } from 'electron';
import { getTranscriptDb } from '../agent-loop/transcript-db.js';

/**
 * Get transcript database instance.
 */
function getDb() {
  return getTranscriptDb();
}

/**
 * Search transcripts handler.
 */
ipcMain.handle('transcript:search', async (_event, query: string, limit = 50) => {
  try {
    const db = getDb();
    const results = db.searchMessages(query, limit);
    return {
      success: true,
      results
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Semantic search handler.
 */
ipcMain.handle('transcript:semantic-search', async (_event, query: string, limit = 20) => {
  try {
    const db = getDb();
    const results = db.semanticSearch(query, limit);
    return {
      success: true,
      results
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Get session handler.
 */
ipcMain.handle('transcript:get-session', async (_event, sessionId: string) => {
  try {
    const db = getDb();
    const session = db.getSession(sessionId);

    if (!session) {
      return {
        success: false,
        error: 'Session not found'
      };
    }

    const messages = db.getMessages(sessionId);
    const events = db.getEvents(sessionId);

    return {
      success: true,
      session,
      messages,
      events
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Get recent sessions handler.
 */
ipcMain.handle('transcript:get-recent-sessions', async (_event, limit = 20, intern?: string) => {
  try {
    const db = getDb();
    const sessions = db.getRecentSessions(limit, intern);

    return {
      success: true,
      sessions
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Get database stats handler.
 */
ipcMain.handle('transcript:get-stats', async () => {
  try {
    const db = getDb();
    const stats = db.getStats();

    return {
      success: true,
      stats
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Vacuum database handler.
 */
ipcMain.handle('transcript:vacuum', async () => {
  try {
    const db = getDb();
    db.vacuum();

    return {
      success: true,
      message: 'Database vacuumed successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});
