# Shop — 多店铺电商平台

模块化单体架构的多店铺电商平台：后端按业务模块划分（模块 = 顶层包 = PG schema），由 Spring Modulith 强制校验边界，可随时拆分为微服务。

## 技术栈

| 层     | 技术                                                                               |
| ------ | ---------------------------------------------------------------------------------- |
| 前端   | TanStack Start (React 19, TypeScript 7, Vite 8, Tailwind v4)                       |
| 后端   | Spring Boot 4.1 + Spring Modulith 2.1 + REST + MyBatis-Plus 3.5                    |
| 数据库 | PostgreSQL 18 (Schema 隔离) + Redis 7                                              |
| 工具   | Maven + pnpm + Lefthook + Oxlint/Oxfmt (TS) + Spotless / Google Java Format (Java) |

## 前置要求

- Java 25 + Maven
- Node.js 22+ + pnpm 11+
- WSL2 上运行的 PostgreSQL 18 + Redis 7（localhost 直连，无需 Docker）

## 快速开始

```bash
# 1. 数据库与 Redis 已在 WSL2 上运行（localhost 直连即可）

# 2. 启动后端（http://localhost:8080）
pnpm dev:server

# 3. 启动买家端（新终端，http://localhost:3000）
pnpm dev:web

# 或者一键启动前后端
pnpm dev
```

## 目录结构

```
shop/
├── apps/
│   ├── web/                    # 买家端 SSR（TanStack Start，3000 端口）
│   ├── seller/                 # 卖家工作台 SPA（5000 端口）
│   ├── admin/                  # 平台管理端 SPA（4000 端口）
│   └── server/                 # Spring Boot 模块化单体（8080 端口）
│       └── src/main/java/com/shop/platform/
│           ├── common/         # 共享纯包：异常体系、Money/PhoneNumber、UserIdHolder 等（框架无关）
│           ├── infra/          # 共享纯包：JWT、Filter、MyBatis 配置等跨模块技术适配
│           └── account/ product/ inventory/ cart/ favorite/ order/ aftersale/ payment/ cms/ shop/
│                              # 业务模块 = 顶层包 = PG schema；内部 controller → dto → service → mapper 三层到底
├── packages/
│   ├── api/                    # TS SDK（@hey-api/openapi-ts 从 openapi/api-docs.json 生成）+ zod 契约校验 + Money/错误码
│   ├── ui-web/                 # shadcn/ui + BaseUI 组件库（CLI 生成，不手写；视觉规则见包内 DESIGN.md）
│   ├── common/                 # 前端共享纯逻辑
│   ├── config/                 # tsconfig / oxlint / oxfmt 共享配置
│   └── test-utils/             # 跨 app 测试装置（MSW handlers / setup / 假数据工厂）
├── openapi/                    # OpenAPI 契约 api-docs.json（后端 /v3/api-docs 导出，pnpm gen:sdk 刷新）
└── docs/                       # 架构 / 约定 / 决策 / 清单（索引见下文「文档地图」）
```

## 架构原则

模块隔离（api 包同步调用 + events 纯通知，`allowedDependencies` 显式登记）、schema 隔离（模块 = 顶层包 = PG schema，禁止跨 schema JOIN）、`common/` 与 `infra/` 为共享纯包、Modulith + ArchUnit 强制校验——完整说明（模块依赖图、请求/认证/下单链路、全库 ID 策略、前后端 domain 对应）见 [docs/architecture.md](docs/architecture.md)。

## 已实现范围与已知边界

已闭环：注册登录（短信/密码 + refresh token 轮换）、商品与 SKU、多店铺、购物车、收藏、
结算预览、按店拆单下单、库存冻结/扣实/释放/回补（含流水账本）、两段式支付（MOCK 渠道）、
订单状态机（发货/收货/取消/超时关单）、已付款取消退款单据、静态 RBAC、CMS 首页配置、
物流（包裹/轨迹/承运商对接/异常治理）、售后（买家申请·撤销·回寄 → 卖家同意·拒绝·确认收货退款，
含卖家退款售后工作台，前后端闭环；规则见 [docs/business-rules/aftersale.md](docs/business-rules/aftersale.md)）、
优惠券（满减/折扣两型的建券·领券·券包·结算选券·下单占用·支付核销·取消释放·退款退券，
买家侧券包·店铺领券·结算选券与卖家侧建券页、平台侧券运营均已接通；规则见
[docs/business-rules/coupon.md](docs/business-rules/coupon.md)）、
买家评价（整单按行评价·追评·卖家回复；规则见
[docs/business-rules/review.md](docs/business-rules/review.md)）、
平台治理动作的操作审计账本（规则见
[docs/business-rules/crosscut.md](docs/business-rules/crosscut.md)）。

尚未实现（刻意留白，不是遗漏）：

- **搜索**只有 `name LIKE '%kw%'`，无倒排索引/相关性排序，量级上去必须换方案
- **支付**仅 MOCK 渠道，未接真实网关（两段式状态机已按可替换设计，见 `PaymentService`）
- **无缓存层、无消息队列**：热点只读直接打库；跨模块异步仅用 Modulith 事件登记表（outbox）
- **营销**：优惠券已闭环两型（满减券 + 折扣券「N 折、封顶必填」，支持「领取后 N 天」相对有效期；
  建券/领券/券包/结算选券/下单占用/支付核销/取消释放/退款退券，买家券包·店铺领券·结算选券与卖家建券页、
  平台券运营（查询/作废）均已接通；规则见 [docs/business-rules/coupon.md](docs/business-rules/coupon.md)，
  与淘系/京东做法的对照见 [docs/reference/coupon-platform-practices.md](docs/reference/coupon-platform-practices.md)）；
  运费券·平台券·券叠加·选券可配·秒杀·积分均未开始（定案见 coupon.md「已定案未实现」节 CPN-N1–N7）
- **评价**已闭环一期：已完成订单按订单行评价（星级 + 文字，可追评一次）、卖家回复一次、
  商详评价区（聚合 + 好评率）、卖家评价管理页；规则见 [docs/business-rules/review.md](docs/business-rules/review.md)。
  晒图这一格后端已备（存 key 不存 URL），前端待买家上传通道
- **分账结算与商家提现**未开始
- **平台管理端**（apps/admin）已有：店铺入驻审核、店铺治理（封店/解封）、用户与员工管理（含创建员工/调岗位）、
  平台类目（属性模板）、CMS 三页、优惠券运营、物流异常处置、操作审计（按人/对象/时间反查 + 导出）
- 未做过多实例部署与压测；已知的单机假设都在代码注释里标了出处
  （如订单号的进程内序列、超时关单不加分布式锁的理由见 `OrderTimeoutCloser`）

详细开发规范（常用命令、错误码流程、各领域规范入口）见 [AGENTS.md](AGENTS.md)。

## 数据库与 Redis

PostgreSQL 18 与 Redis 7 运行在 WSL2 上，Windows 侧通过 localhost 直连：

```
数据库：shop:shop_dev@localhost:5432/shop
Redis：localhost:6379
```

## 文档地图

| 文档                                                   | 内容                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [AGENTS.md](AGENTS.md)                                 | 通用入口：命令/开发规范/错误码流程/高频硬规则 + 各领域规范索引（AI 与开发者的入口）                    |
| [docs/architecture.md](docs/architecture.md)           | 架构总览：模块依赖图、关键链路、全库 ID 策略、前后端 domain 对应                                       |
| [packages/ui-web/DESIGN.md](packages/ui-web/DESIGN.md) | 视觉规则：使用铁律、色彩语义、形状海拔、三端设计画像                                                   |
| [TODO.md](TODO.md)                                     | 进行中任务与近期计划                                                                                   |
| [docs/error-codes.md](docs/error-codes.md)             | 错误码唯一真相源                                                                                       |
| [docs/conventions/](docs/conventions/)                 | 持续维护的约定（前端规范、取数口径论证、权限码表、业务事件日志、[i18n 约定](docs/conventions/i18n.md)、[前端监控](docs/conventions/frontend-monitoring.md)）                                       |
| [docs/business-rules/](docs/business-rules/)           | 业务规则库：按领域的生效规则，逐条带编号（源自代码；原 docs/decisions/ 设计笔记已并入并归档 git 历史） |
| [docs/reference/](docs/reference/)                     | 外部调研资料（券平台做法对照）                                                                         |

## 开发规范

提交信息（Conventional Commits）、常用命令、前端测试写法、UI 组件接入等规范统一见 [AGENTS.md](AGENTS.md)，此处不再重复维护。

后端测试分快慢两环：`mvn test` 只跑 `*Test`（单元 + MockMvc 接口层，不碰数据库），`mvn verify` 追加 `*IT`（真库集成测试，需 shop_test 库可达）。CI 门禁应以 `mvn verify` 为准；当前 workflow 只跑 `mvn compile`（后端 job 未配 PG/Redis 服务，接入时再放开，见 `.github/workflows/ci.yml` 注与 [TODO](TODO.md)）。

Lefthook：pre-commit 自动格式化并跑 lint，commit-msg 校验提交信息，pre-push 跑全量 lint / typecheck / 测试 / Java 编译 / SDK 契约漂移检查。
