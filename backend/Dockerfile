# syntax=docker/dockerfile:1.7

FROM oven/bun:1.4.4 AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY patches patches

# Keep dependency downloads cached when workspace manifests change.
RUN bun pm fetch

COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/finance/package.json packages/finance/package.json
COPY packages/sql/package.json packages/sql/package.json

RUN bun i --offline --frozen-lockfile --linker=isolated

COPY packages/sql/compatibility/early-rc/package.json packages/sql/compatibility/early-rc/bun.lock packages/sql/compatibility/early-rc/
RUN cd packages/sql/compatibility/early-rc && bun install --frozen-lockfile

FROM deps AS build

WORKDIR /app

ARG COMPANY_SLUG
ARG NODE_ENV=production

ENV COMPANY_SLUG=${COMPANY_SLUG}
ENV NODE_ENV=${NODE_ENV}

COPY . .

RUN --mount=type=secret,id=DATABASE_URL DATABASE_URL="$(cat /run/secrets/DATABASE_URL)" bunx turbo -F backend build

FROM oven/bun:1.4.4 AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/packages/sql/out ./packages/sql/out
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY --from=deps /app/packages/sql/node_modules ./packages/sql/node_modules
COPY --from=build /app/packages/sql/package.json ./packages/sql/package.json
COPY --from=build /app/packages/sql/prisma.config.ts ./packages/sql/prisma.config.ts
COPY --from=build /app/packages/sql/scripts ./packages/sql/scripts
COPY --from=build /app/packages/sql/src/prisma ./packages/sql/src/prisma
COPY --from=build /app/packages/sql/migrations ./packages/sql/migrations
COPY --from=build /app/packages/sql/migrations-native ./packages/sql/migrations-native
COPY --from=build /app/packages/sql/compatibility/native-baseline ./packages/sql/compatibility/native-baseline
COPY --from=deps /app/packages/sql/compatibility/early-rc ./packages/sql/compatibility/early-rc

WORKDIR /app/backend

RUN mkdir -p static

EXPOSE 3333

CMD ["bun", "dist/main.js"]
