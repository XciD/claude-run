import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import "./index.css";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}

// Catch unhandled errors that escape React
window.onerror = (msg, src, line, col, err) => {
  console.error("[global error]", msg, src, line, col, err);
};
window.onunhandledrejection = (e) => {
  console.error("[unhandled rejection]", e.reason);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
