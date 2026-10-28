import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { plugins } from "../plugins/manager.js";
import { buildServer } from "./build.js";

await plugins.loadAll();
await buildServer({ remote: false }).connect(new StdioServerTransport());
