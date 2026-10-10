# One image per standalone workspace app, selected at build time:
#   docker build --build-arg APP=mcp  -t <image> .   # apps/mcp, MCP server, port 8787
#   docker build --build-arg APP=jobs -t <image> .   # apps/jobs, background workers, port 8788
#
# No secrets are copied or baked in. Configure at run time with -e or --env-file.

ARG NODE_IMAGE=node:24-slim

# `pnpm deploy` installs the selected app's production dependencies from the root lockfile and copies
# the app plus the workspace packages it uses (as plain directories, not symlinks) into /out, so the
# runtime stage needs no pnpm and none of the other workspaces. Corepack installs the pnpm version
# pinned by "packageManager". The pnpm store is a BuildKit cache, so a rebuild only downloads what
# changed.
FROM ${NODE_IMAGE} AS build
ARG APP
RUN case "$APP" in mcp|jobs) ;; *) echo "build-arg APP must be mcp or jobs" >&2; exit 1 ;; esac
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
COPY apps/jobs/package.json apps/jobs/
COPY packages/ packages/
COPY apps/${APP}/ apps/${APP}/
RUN --mount=type=cache,id=atlasnews-pnpm-store,target=/pnpm/store \
    pnpm --store-dir /pnpm/store --filter "@atlasnews/${APP}" deploy --prod /out

FROM ${NODE_IMAGE} AS runtime
# Node does not handle SIGTERM by default, and PID 1 ignores unhandled signals. Without an init,
# `docker stop` would wait out the grace period and then SIGKILL. tini forwards the signal.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
# The app reads PORT and defaults to 8787 (mcp) or 8788 (jobs). It listens on all interfaces.
USER node
ENTRYPOINT ["tini", "--"]
# The app runs its TypeScript source through tsx; there is no compile step.
CMD ["node", "--import", "tsx", "src/node.ts"]
