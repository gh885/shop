# Shop — 多店铺电商平台

## 技术栈

- 前端：TanStack Start (React 19), TypeScript 7, Vite 8, Tailwind v4, TanStack Query/Router
- 后端：Spring Boot 4.1, Spring Modulith 2.1, gRPC, MyBatis-Plus 3.5, PostgreSQL 18, Redis 7
- 工具：Maven, pnpm, Docker Compose, Lefthook, Oxlint/Oxfmt, Spotless (Google Java Format)

## 项目结构

```
shop/                    ← monorepo, 不用 monorepo 工具
apps/server/             ← Spring Boot 模块化单体, 不参与 pnpm workspace
apps/web/                ← 买家端 SSR
apps/seller/             ← 卖家工作台 SPA
apps/admin/              ← 平台管理端 SPA
packages/                ← 共享包（api-client / domain / ui-web / i18n / config）
proto/                   ← protobuf 契约, 唯一 API 事实来源
```

## 关键架构规则

1. **模块隔离**：模块之间不 import 对方的 service/repo，只靠 Spring Modulith Event Bus 通信
2. **Schema 隔离**：每个模块拥有自己的 PG schema（`product.products`），可只读跨 schema 按 ID 查字段
3. **不许跨 schema JOIN**
4. **共享内核极小**：只放 UserId、Money、Address 等跨模块类型和 Event Bus 基础设施
5. **@Modulithic 强制校验模块边界**，测试期跨模块 import 直接报错

## 后端模块组织

```
server/src/main/java/com/shop/platform/
├── ShopServerApplication.java    ← @Modulithic
├── kernel/                       ← 共享内核
├── auth/                         ← 模块 = 顶层包 = PG schema
│   ├── AuthModuleConfig.java     ← @ConditionalOnProperty 开关
│   ├── package-info.java         ← @ApplicationModule
│   ├── controller/               ← gRPC 入口（gRPC）或 REST
│   ├── service/                  ← 业务逻辑
│   └── mapper/                   ← Entity + Mapper
├── product/
├── order/
└── …
```

- 模块内部结构：controller → service → mapper，三层到底
- BO/Model 可选，不预创建空目录
- events/ 目录只在需要跨模块事件时创建

## 常用命令

```bash
# 开发
pnpm dev              # 前后端同时启动
pnpm dev:server       # 后端（Spring Boot）
pnpm dev:web          # 前端（Vite 开发服务器）

# 检查
pnpm lint             # oxlint + mvn compile
pnpm format           # oxfmt + spotless:apply
pnpm typecheck        # tsc --noEmit

# 构建
pnpm build            # vite build + mvn compile

# Java 单独
cd apps/server && mvn spotless:apply   # 格式化 Java
cd apps/server && mvn compile          # 编译检查
cd apps/server && mvn spring-boot:run  # 启动后端
```

## 开发规范

- 提交遵循 Conventional Commits：`<type>(<scope>): <subject>`（scope 可选）
- TypeScript 4 空格缩进，Java 遵循 Google Java Format AOSP 风格
- 所有金额用 `Money` 类型（amount + currency），不裸传 int64
- 错误码格式：`MODULE_ERROR_NAME_STATUS`
- `pnpm dev:server` / `pnpm dev:web` 分别启动前后端
- `pnpm format` 同时格式化 TS 和 Java

## 包名

```
com.shop.platform       ← 后端主包
com.shop.platform.kernel
com.shop.platform.auth
…
```

## Docker

```bash
docker compose -f deploy/docker-compose.yml up -d   # PostgreSQL 18 + Redis 7
```

数据库：`shop:shop_dev@localhost:5432/shop`
