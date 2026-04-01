/**
 * Mock Electron APIs for browser testing
 * This file is loaded before tests via playwright.config.ts
 */

// Mock platform
;(window as any).platform = 'darwin'

// Mock electronAPI with stub implementations
;(window as any).electronAPI = {
  // Terminal APIs
  createSession: async () => ({ success: true, sessionId: 'test-session' }),
  resizeSession: async () => ({ success: true }),
  writeToSession: async () => ({ success: true }),
  getSessionCwd: async () => ({ success: true, cwd: '/Users/test/project' }),
  destroySession: async () => ({ success: true }),

  // File APIs
  readFile: async (path: string) => {
    if (path.includes('package.json')) {
      return { success: true, content: JSON.stringify({ name: 'aiterminal', version: '0.1.0' }, null, 2) }
    }
    if (path.includes('.gitignore')) {
      return { success: true, content: 'node_modules\ndist\n.env' }
    }
    return { success: true, content: 'Mock file content' }
  },
  writeFile: async () => ({ success: true }),
  editFile: async () => ({ success: true }),
  deleteFile: async () => ({ success: true }),
  listDirectory: async () => ({ success: true, entries: [] }),

  // AI APIs
  aiQueryStream: async () => ({ success: true }),
  cancelAIStream: async () => ({ success: true }),

  // Agent APIs
  agentExec: async () => ({ output: 'mock output', exitCode: 0, executionId: 'test' }),
  killAgentProcesses: async () => ({ success: true }),

  // Theme/Accent
  getStoredTheme: async () => ({ success: true, themeId: 'dracula' }),
  setStoredTheme: async () => ({ success: true }),

  // Transcript
  transcriptStartSession: async () => ({ success: true, sessionId: 'test-transcript' }),
  transcriptAddMessage: async () => ({ success: true }),
  transcriptSearchContext: async () => ({ success: true, context: '' }),

  // Voice
  startVoiceCapture: async () => ({ success: true }),
  stopVoiceCapture: async () => ({ success: true, text: '' }),

  // Other
  showItemInFolder: async () => ({ success: true }),
  openPath: async () => ({ success: true }),
  minimizeWindow: async () => {},
  maximizeWindow: async () => {},
  closeWindow: async () => {},
}

console.log('Electron APIs mocked for browser testing')
