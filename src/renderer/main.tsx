/*
 * Path: /Users/ghost/Desktop/aiterminal/src/renderer/main.tsx
 * Module: renderer
 * Purpose: React entry point - renders App component to DOM
 * Dependencies: react-dom, @xterm/xterm, react components
 * Related: /Users/ghost/Desktop/aiterminal/src/renderer/App.tsx
 * Keywords: entry-point, react-root, xterm-css, global-styles
 * Last Updated: 2026-03-24
 */

import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import { ConversationProvider } from "@elevenlabs/react";
import { App } from "./App";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/cmd-k.css";
import "./styles/chat.css";
import "./styles/autocomplete.css";
import "./styles/file-preview.css";
import "./styles/file-tree.css";
import "./styles/diff.css";
import "./styles/agent.css";
import "./styles/file-picker.css";
import "./styles/troubleshoot.css";
import "./styles/agent-cursors.css";
import "./styles/keybindings.css";
import "./styles/editor-tabs.css";
import "./styles/file-editor.css";
import "./styles/speech-bubbles.css";
import "./styles/virtual-assistant-chat.css";
import "./components/RightSidebarBottom.css";
import "./components/TerminalActivityView.css";

// Set platform class on <html> for CSS platform-specific fallbacks
const platform = (window as any).platform as string | undefined;
if (platform && platform !== 'darwin') {
  document.documentElement.classList.add('no-vibrancy');
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found. Ensure index.html contains <div id='root'></div>");
}

// Add error boundary to catch React initialization errors
try {
  // No StrictMode — it double-mounts in dev, creating duplicate xterm instances
  createRoot(rootElement).render(
    <ConversationProvider>
      <App />
    </ConversationProvider>
  );
} catch (error) {
  console.error('[main] Failed to render React app:', error);
  // Show error on screen for debugging
  rootElement.innerHTML = `
    <div style="padding: 20px; color: white; font-family: monospace;">
      <h2>Failed to load AITerminal</h2>
      <pre style="background: rgba(255,0,0,0.1); padding: 10px; overflow: auto;">${error instanceof Error ? error.message : String(error)}</pre>
      <p>Check the browser console (Cmd+Option+I) for more details.</p>
    </div>
  `;
  throw error;
}
