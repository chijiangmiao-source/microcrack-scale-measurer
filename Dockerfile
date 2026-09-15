# syntax=docker/dockerfile:1

# ---- 构建阶段：安装依赖并产出静态资源 ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Web 阶段：nginx 托管纯前端静态文件 ----
FROM nginx:1.27-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# ---- 验收阶段：Vitest 单元测试 + Playwright 端到端测试（一次性运行） ----
FROM mcr.microsoft.com/playwright:v1.47.2-jammy AS verify
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# E2E_BASE_URL 由 docker-compose 注入，指向 web 服务
CMD ["npm", "run", "verify"]
