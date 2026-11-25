import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "../shared/help.css";
import "../shared/workspace-appearance.css";
import "../shared/workspace-material.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
