# 基础镜像地址，可通过 build-arg 覆盖（例如国内网络用镜像站）
ARG NODE_IMAGE=node:22-bookworm-slim

# 构建阶段：安装依赖、构建前后端
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter web build && pnpm --filter server build

# 运行阶段：只保留生产依赖与构建产物
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN pnpm install --prod --frozen-lockfile --filter server
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
WORKDIR /app/server
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
