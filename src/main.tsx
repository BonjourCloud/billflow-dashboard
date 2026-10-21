
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.tsx";
import { resolveClerkPublishableKey } from "./lib/clerkPublishableKey";
import "./index.css";

const clerkPublishableKey = resolveClerkPublishableKey(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={clerkPublishableKey}>
    <App />
  </ClerkProvider>,
);
