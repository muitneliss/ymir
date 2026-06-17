import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node18",
  bundle: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
