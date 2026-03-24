import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
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

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found. Ensure index.html contains <div id='root'></div>");
}

// No StrictMode — it double-mounts in dev, creating duplicate xterm instances
createRoot(rootElement).render(<App />);
