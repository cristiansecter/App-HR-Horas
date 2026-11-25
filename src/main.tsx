import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { tenantConfig } from "@/config/tenant.config";
import { applyTenantTheme } from "@/config/theme";
import { initColorMode } from "@/ui/colorMode";
import "./styles.css";

applyTenantTheme(tenantConfig);
initColorMode();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
