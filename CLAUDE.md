# Shop — 多店铺电商平台

## 技术栈

- 前端：TanStack Start (React 19), TypeScript 7, Vite 8, Tailwind v4, TanStack Query/Router
- 后端：Spring Boot 4.1, Spring Modulith 2.1, REST (OpenAPI), MyBatis-Plus 3.5, PostgreSQL 18, Redis 7
- 工具：Maven, pnpm, Docker Compose, Lefthook, Oxlint/Oxfmt, Spotless (Google Java Format)

## 项目结构

```
shop/                    ← monorepo, 不用 monorepo 工具
apps/server/             ← Spring Boot 模块化单体, 不参与 pnpm workspace
apps/web/                ← 买家端 SSR
apps/seller/             ← 卖家工作台 SPA
apps/admin/              ← 平台管理端 SPA
packages/                ← 共享包（api-client / domain / ui-web / i18n / config）
openapi/                 ← OpenAPI 契约, 唯一 API 事实来源
```

## 关键架构规则

1. **模块隔离**：模块之间不 import 对方的 service/repo，只靠 Spring Modulith Event Bus 通信
2. **Schema 隔离**：每个模块拥有自己的 PG schema（`product.products`），可只读跨 schema 按 ID 查字段
3. **不许跨 schema JOIN**
4. **`common/` 属于纯包**，不属于任何 Modulith 模块，无`@ApplicationModule`
5. **@Modulithic 强制校验模块边界**，测试期跨模块 import 直接报错

## 后端模块组织

```
server/src/main/java/com/shop/platform/
├── ShopServerApplication.java    ← @Modulithic（无 sharedModules）
├── common/                       ← 跨模块共享（响应封装、异常体系、UserIdHolder）
├── auth/                         ← 模块 = 顶层包 = PG schema
│   ├── AuthModuleConfig.java     ← @ConditionalOnProperty 开关
│   ├── package-info.java         ← @ApplicationModule
│   ├── controller/               ← REST 入口
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

## 编码风格 — Java

### Lombok 注解

能用就用，不手写模板代码：

| 场景 | 注解 |
|------|------|
| POJO / DTO 全部字段可读写 | `@Data` |
| POJO 部分字段不可变 | `@Getter` + `@Setter`（按需） |
| 无参构造（MyBatis-Plus 需要） | `@NoArgsConstructor` |
| 全部参数构造 | `@AllArgsConstructor` |
| 仅 `final` 字段构造（配合 `@Data` 或 `@Getter`） | `@RequiredArgsConstructor` |
| 日志 | `@Slf4j` |

### Record

能用 `record` 的场景就用 `record`：
- 请求/响应 DTO（配合 `jakarta.validation` 注解）
- 不可变值对象
- 业务方法的返回值（如 `TokenResult`）

（Spring 4.x 已完全支持 `record`，MyBatis-Plus 3.5.x 也兼容。）

### @Builder

构造器参数 **≥ 3 个** 时加 `@Builder`（配合 `@AllArgsConstructor(access = AccessLevel.PRIVATE)` 或 `@Data`）。
