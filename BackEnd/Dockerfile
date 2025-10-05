# syntax=docker/dockerfile:1
## Base image with system deps Prisma needs
FROM node:24.7.0-slim AS base
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*

## Install deps and generate Prisma client
FROM base AS deps
COPY package*.json ./
#RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

## Final runtime image
FROM base AS runner
WORKDIR /app
# Disable Optimize in container; avoid runtime import errors
ENV PRISMA_OPTIMIZE_ENABLED=false \
    NODE_OPTIONS="--experimental-loader=/app/scripts/stub-optimize-loader.mjs"

# Bring in production node_modules and app files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

# Stub loader to short-circuit '@prisma/extension-optimize' import
RUN mkdir -p ./scripts \
 && printf "export function withOptimize() { return {}; }\n" > ./scripts/extension-optimize-stub.mjs \
 && printf "import { pathToFileURL } from 'node:url';\nconst url = pathToFileURL('/app/scripts/extension-optimize-stub.mjs').href;\nexport async function resolve(specifier, context, nextResolve) {\n  if (specifier === '@prisma/extension-optimize') {\n    return { shortCircuit: true, url };\n  }\n  return nextResolve(specifier, context);\n}\n" > ./scripts/stub-optimize-loader.mjs

EXPOSE 3005

CMD ["node", "src/app.js"]
