
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.tsx";
import { resolveClerkPublishableKey } from "./lib/clerkPublishableKey";
import { installChunkErrorReload } from "./lib/chunkReload";
import { initAnalytics } from "./lib/analytics";
import { warmUpApi } from "./lib/api";
import "./index.css";

const clerkPublishableKey = resolveClerkPublishableKey(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

installChunkErrorReload();
initAnalytics(import.meta.env.VITE_GA_MEASUREMENT_ID);
warmUpApi();

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={clerkPublishableKey}>
    <App />
  </ClerkProvider>,
);
