import { serveFetchHandler } from "@atlasnews/adapters/node/serve";
import { handleJobsRequest } from "./handler";

serveFetchHandler(handleJobsRequest, {
  name: "jobs",
  port: Number(process.env.PORT) || 8788,
});
