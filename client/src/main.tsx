import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { AppProvider } from "./state/AppContext";

// Aplica o tema salvo antes do primeiro render (evita "piscar" claro -> escuro).
try {
  if (localStorage.getItem("theme") === "dark") document.documentElement.classList.add("dark");
} catch {
  /* armazenamento indisponível */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
