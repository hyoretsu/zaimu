# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.12 AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/finance/package.json packages/finance/package.json
COPY packages/sql/package.json packages/sql/package.json
COPY patches patches

RUN bun i --frozen-lockfile --linker=isolated

FROM deps AS build

WORKDIR /app

ARG COMPANY_SLUG
ARG NODE_ENV=production

ENV COMPANY_SLUG=${COMPANY_SLUG}
ENV NODE_ENV=${NODE_ENV}

COPY . .

RUN --mount=type=secret,id=DATABASE_URL DATABASE_URL="$(cat /run/secrets/DATABASE_URL)" bunx turbo -F backend build

FROM oven/bun:1.3.12 AS runtime

WORKDIR /app

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/packages/sql/out ./packages/sql/out

WORKDIR /app/backend

RUN mkdir -p static

EXPOSE 3333

CMD ["bun", "dist/main.js"]
