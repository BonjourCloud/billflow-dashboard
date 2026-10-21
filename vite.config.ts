import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { resolveApiBaseUrl } from "./src/lib/apiBaseUrl";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "production") {
    // Fail the build rather than ship a bundle that calls localhost.
    const env = loadEnv(mode, process.cwd(), "VITE_");
    resolveApiBaseUrl(env.VITE_API_URL, true);
  }

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
