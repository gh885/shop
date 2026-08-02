# Shop — 多店铺电商平台

## 技术栈

- 前端：TanStack Start (React 19), TypeScript 7, Vite 8, Tailwind v4, TanStack Query/Router
- 后端：Spring Boot 4.1, Spring Modulith 2.1, REST (OpenAPI), MyBatis-Plus 3.5, PostgreSQL 18, Redis 7
- 工具：Maven, pnpm, Lefthook, Oxlint/Oxfmt, Spotless (Google Java Format)

## 项目结构

```
shop/                    ← monorepo, 不用 monorepo 工具
apps/server/             ← Spring Boot 模块化单体, 不参与 pnpm workspace
apps/web/                ← 买家端 SSR
apps/seller/             ← 卖家工作台 SPA
apps/admin/              ← 平台管理端 SPA
packages/                ← 共享包（api / ui-web / common / config）
openapi/                  ← （预留）OpenAPI 契约 —— 当前未启用，前端 API 类型手动维护于 packages/api
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

## UI 组件库

组件库用 **shadcn/ui + BaseUI + Tailwind v4**，所有组件由 CLI 生成到 `packages/ui-web`，不手写。

### 添加组件

```bash
# 必须用 npx（pnpm dlx 会因 store 里 zod v4 冲突而报错）
"yes" | npx -y shadcn@latest add <component-name> --cwd packages/ui-web
```

示例：

```bash
"yes" | npx -y shadcn@latest add button input dialog --cwd packages/ui-web
```

### 设计约定

- 底层无样式组件：`@base-ui/react`（BaseUI），WAI-ARIA 合规
- 样式系统：Tailwind v4 + 分层主题 token（`packages/ui-web/src/styles.css`）
  - Layer 1 Primitive（`--neutral/--brand/--green…` 色阶）：禁止组件直接使用
  - Layer 2 Semantic（`--color-*`）：组件只用这层；明暗模式只重写这层映射
  - 风格定位：消费级电商转化风——中性灰撑全场，品牌暖红只做转化引导（CTA）
- 图标库：`lucide-react`
- 组件导出：`packages/ui-web/src/index.ts` → 各 app 直接 import

### App 接入 ui-web（如 apps/web）

- 样式入口只需 `@import '@shop/ui-web/src/styles.css'`（内含 tailwindcss 与主题变量，不要重复 import tailwindcss）
- 必须加 `@source '../../../packages/ui-web/src'`（Tailwind v4 内容探测不覆盖 app 目录之外的包，否则组件类名不生成 CSS）
- API 请求走 Vite proxy 同源（`/auth`、`/api` → `localhost:8080`），浏览器端 baseUrl 用空串；SSR loader 里需绝对地址
- 登录态：`apps/web/src/lib/auth.ts`（access token 存 localStorage，refresh token 走后端 httpOnly cookie）
- 启动时 `bootstrapAuth()` 静默刷新（`lib/api.ts`），root 布局挂载处调用；受保护路由用 `beforeLoad: () => requireAuth()` 守卫，未登录自动拉起全局登录 Dialog
- 用户信息：`useMe()`（`lib/me.ts`，TanStack Query 缓存，未登录不发请求）
- 表单：用 `useAppForm`（`@shop/ui-web`，TanStack Form + Zod validators），不手写裸 state 表单

## 开发规范

- 提交遵循 Conventional Commits：`<type>(<scope>): <subject>`（scope 可选）
- TypeScript 4 空格缩进，Java 遵循 Google Java Format AOSP 风格
- 所有金额用 `Money` 类型（amount + currency），不裸传 int64
- `pnpm dev:server` / `pnpm dev:web` 分别启动前后端
- `pnpm format` 同时格式化 TS 和 Java

## 命名规范（Java 三层契约）

后缀只标方向，不标层次；出参能复用就复用，变形才新建。

- **数据库对象（mapper 包）**：裸名词，无后缀 —— `Product` / `Sku` / `Category` / `User`；Mapper 接口以 `Mapper` 结尾
- **HTTP 入参（controller 包）**：`<动作>Request` —— `CreateProductRequest` / `SmsLoginRequest`；`Request` 后缀只允许出现在 controller 包
- **业务入参聚合（service 包）**：`<动作>Command`，仅当入参字段多到无法拆包传基本类型时使用 —— `CreateProductCommand`
- **出参**：能直接返回实体/已有类型就不新建；必须变形时按形状命名（`CategoryNode`、`TokenResult`），不贴统一的 `XxxResponse` 标签
- **子组件**：Request/Command 内部的嵌套小组件（如 `ParamItem`）按语义命名，不受方向后缀约束

由 `apps/server/src/test/java/com/shop/platform/NamingRulesTest.java`（ArchUnit）强制校验。

## 错误码规范

**定义原则：只有当 HTTP status 不足以让前端区分处理逻辑时，才定义 error code。**

```
SSR（Spring Boot）：throw 时直接硬编码字符串，不维护常量类
TS（packages/api）：从 docs/error-codes.md 同步到 error-codes.ts

唯一真相源：docs/error-codes.md
```

**操作规则：**

1. 新建 code 必须先在 `docs/error-codes.md` 写清「前端行为」和「后端触发场景」
2. Java 侧直接写字符串：`throw new BusinessException(400, "SMS_CODE_EXPIRED", "验证码已过期")`
3. TS 侧同步到 `packages/api/src/schemas/error-codes.ts`
4. code 用 `SCREAMING_SNAKE_CASE`
5. 前端能用 status 区分的场景（401/403/404）不加 code
6. 会被前端 Zod 拦截的校验错误不加 code

## 包名

```
com.shop.platform       ← 后端主包
com.shop.platform.infra
com.shop.platform.auth
…
```

## 数据库与 Redis（WSL2）

PostgreSQL 18 与 Redis 7 运行在 WSL2 上，不再用 Docker。Windows 侧通过 localhost 直连即转发到 WSL2。

数据库：`shop:shop_dev@localhost:5432/shop`
Redis：`localhost:6379`
