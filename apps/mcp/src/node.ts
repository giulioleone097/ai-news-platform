import { serveFetchHandler } from "@atlasnews/adapters/node/serve";
import { handleMcpServerRequest } from "./handler";

serveFetchHandler(handleMcpServerRequest, {
  name: "mcp",
  port: Number(process.env.PORT) || 8787,
});
