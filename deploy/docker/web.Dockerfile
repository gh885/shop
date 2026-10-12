# 买家端 SSR 运行镜像。构建上下文是 CI 临时拼出的目录（见 .github/workflows/deploy.yml 的 stage 步骤）：
#   dist/                 apps/web 的生产构建（client + server；*.map 已剔除，归档到 artifact 不进镜像）
#   node_modules/srvx/    SSR 的 HTTP 托管器（TanStack Start 官方 Node 口径），零依赖
#
# 为什么只有这两样：apps/web/vite.config.ts 在生产构建开了 ssr.noExternal，依赖全部打进
# dist/server/server.js，运行时没有裸 import，所以不需要带 node_modules。
FROM node:24-alpine

LABEL org.opencontainers.image.source="https://github.com/gh885/shop" \
      org.opencontainers.image.description="shop web (TanStack Start SSR)"

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --chown=node:node node_modules/srvx ./node_modules/srvx
COPY --chown=node:node dist ./dist

USER node
EXPOSE 3000

# --dir=. 必须给：srvx 的 --static 默认相对「入口文件所在目录」解析，不给会把 dist/client
# 拼成 dist/server/dist/client 并静默关掉静态服务（与 apps/web/package.json 的 start 一致）。
CMD ["node", "node_modules/srvx/bin/srvx.mjs", "serve", "--prod", "--dir=.", "--static=dist/client", "--entry=dist/server/server.js"]
