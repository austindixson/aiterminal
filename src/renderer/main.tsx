import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found. Ensure index.html contains <div id='root'></div>");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
