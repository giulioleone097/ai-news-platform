# One image per standalone workspace app, selected at build time:
#   docker build --build-arg APP=mcp  -t <image> .   # apps/mcp, MCP server, port 8787
#   docker build --build-arg APP=jobs -t <image> .   # apps/jobs, background workers, port 8788
#
# No secrets are copied or baked in. Configure at run time with -e or --env-file.

ARG NODE_IMAGE=node:24-slim

# Install from the root lockfile, scoped to the selected app and the workspace packages it links.
# Manifests are copied first so source edits do not invalidate this layer.
FROM ${NODE_IMAGE} AS deps
ARG APP
RUN case "$APP" in mcp|jobs) ;; *) echo "build-arg APP must be mcp or jobs" >&2; exit 1 ;; esac
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
COPY apps/jobs/package.json apps/jobs/
COPY packages/core/package.json packages/core/
COPY packages/contract/package.json packages/contract/
COPY packages/adapters/package.json packages/adapters/
RUN npm ci --workspace "apps/${APP}" --no-audit --no-fund

# Keep only what the selected app runs: its source, and each workspace package that npm linked
# into node_modules for it (jobs does not use contract, so it is dropped).
FROM deps AS build
ARG APP
COPY packages/ packages/
COPY apps/${APP}/ apps/${APP}/
RUN for p in core contract adapters; do \
      [ -e "node_modules/@atlasnews/$p" ] || rm -rf "packages/$p"; \
    done

FROM ${NODE_IMAGE} AS runtime
ARG APP
# Node does not handle SIGTERM by default, and PID 1 ignores unhandled signals. Without an init,
# `docker stop` would wait out the grace period and then SIGKILL. tini forwards the signal.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    APP=${APP}
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/${APP} ./apps/${APP}
# The app reads PORT and defaults to 8787 (mcp) or 8788 (jobs). It listens on all interfaces.
USER node
ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "exec node --import tsx apps/$APP/src/node.ts"]
