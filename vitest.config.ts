import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js aliases the bare "server-only" import to its own compiled
      // stub at build time (see node_modules/next/dist/compiled/server-only);
      // it is never a real dependency in package.json. Vitest doesn't run
      // through webpack/Turbopack, so it needs the same alias to resolve.
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/**/*.test.ts",
        "src/lib/supabase/**",
        "src/lib/google/**",
        "src/lib/prisma.ts",
        "src/lib/types.ts",
      ],
    },
  },
});
