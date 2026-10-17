# Shop — 多店铺电商平台

模块化单体架构的多店铺电商平台：后端按业务模块划分（模块 = 顶层包 = PG schema），由 Spring Modulith 强制校验边界。模块之间大量是**同事务同步调用**（下单冻库存、支付推单、退款监听），编译期干净、事务上一体——这是强一致优先的单体取舍，不是"随时可拆微服务"，拆任何一个都要先把同事务命令改成 saga 或最终一致（口径见 [apps/server/AGENTS.md](apps/server/AGENTS.md)「模块边界规范」）。

## 技术栈

| 层     | 技术                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 前端   | TanStack Start (React 19, TypeScript 7, Tailwind v4) 跑在 **Vite+ 1.0** 上                                                                       |
| 后端   | Spring Boot 4.1 + Spring Modulith 2.1 + REST + MyBatis-Plus 3.5                                                                                  |
| 数据库 | PostgreSQL 18 (Schema 隔离) + Redis 7                                                                                                            |
| 工具   | Maven (Java) + **Vite+ `vp`**（Vite 8 / Rolldown、Vitest 5、Oxlint、Oxfmt、tsgolint）+ pnpm 12 + Lefthook + Spotless / Google Java Format (Java) |

## 前置要求

- Java 25 + Maven
- Node.js 22.18+ / 24.11+ / 26+（Vite+ 的 engines 口径；pnpm 版本由 `package.json` 的 `devEngines` 与 lockfile 记死，装依赖用 `vp install`）
- PostgreSQL 18 + Redis 7，默认在云主机的容器里（本地 ssh 端口隧道 15432/6379 接进去，无需 Docker）

## 快速开始

```bash
# 1. 数据库与 Redis 已在 WSL2 上运行（localhost 直连即可）

# 2. 启动后端（http://localhost:8080）
pnpm dev:server

# 3. 启动买家端（新终端，http://localhost:3000）
pnpm --filter web dev

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
│           ├── infra/          # 共享纯包：JWT、Filter、MyBatis 配置、读缓存名单等跨模块技术适配
│           └── account/ shop/ product/ inventory/ cart/ favorite/ order/ payment/ aftersale/
│               logistics/ coupon/ review/ cms/ recommend/ audit/
│                              # 15 个业务模块 = 顶层包 = PG schema（order 的 schema 是 orders，recommend V1 还没有表）；
│                              # 内部 controller → dto → service → mapper 三层到底，职责与依赖逐个见各模块 package-info.java
├── packages/
│   ├── api/                    # TS SDK（@hey-api/openapi-ts 从 openapi/api-docs.json 生成）+ zod 契约校验 + Money/错误码
│   ├── ui-web/                 # shadcn/ui + BaseUI 组件库（CLI 生成，不手写；视觉规则见包内 DESIGN.md）
│   ├── common/                 # 前端共享纯逻辑
│   ├── app-kit/                # 三端应用装配（QueryClient 工厂 / MutationMeta / QueryBoundary / 登录装配 / renderWithProviders）
│   ├── config/                 # tsconfig 共享；oxlint/oxfmt 两份配置由根 vite.config.ts 消费（不是独立可跑配置）
│   └── test-utils/             # 跨 app 测试装置（MSW handlers / setup / 假数据工厂）
├── openapi/                    # OpenAPI 契约 api-docs.json（后端 /v3/api-docs 导出，pnpm sdk:gen 刷新）
└── docs/                       # 架构 / 约定 / 决策 / 清单（索引见下文「文档地图」）
```

## 架构原则

模块隔离（api 包同步调用 + events 纯通知，`allowedDependencies` 显式登记）、schema 隔离（模块 = 顶层包 = PG schema，禁止跨 schema JOIN）、`common/` 与 `infra/` 为共享纯包、Modulith + ArchUnit 强制校验——完整说明（模块依赖图、请求/认证/下单链路、全库 ID 策略、前后端 domain 对应）见 [docs/architecture.md](docs/architecture.md)。

## 已实现范围与已知边界

已闭环：注册登录（短信/密码 + refresh token 轮换）、账号注销（冷静期 → 匿名化，跨模块清理走事件）、
商品与 SKU、多店铺、购物车、收藏、结算预览、按店拆单下单、库存冻结/扣实/释放/回补（含流水账本）、
两段式支付（MOCK 渠道）、订单状态机（发货/收货/取消/超时关单）、已付款取消退款单据、静态 RBAC、
CMS 首页配置、首页 feed 流（随机批次货架流：种子 + 游标翻页，不回 total；个性化与埋点是 V2/V3）、
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

- **搜索**的语义仍是包含匹配（`name / subtitle ILIKE '%kw%'`），无分词、无相关性排序；但 `%kw%` 已走 `pg_trgm` 的 GIN 索引（V67），不再是无索引的全表扫。要相关度 / 同义词 / 中文分词时再评估 tsvector 或外部搜索服务——那是可选项，不是欠账（决策与重评触发条件见 [docs/reference/search-decision.md](docs/reference/search-decision.md)）
- **支付**仅 MOCK 渠道，未接真实网关（两段式状态机已按可替换设计，见 `PaymentService`）
- **不引入消息队列；读缓存刻意只三块**：跨模块异步只走 Modulith 事件登记，且 8 个跨模块监听方法目前全是同步同事务的 `@EventListener`——`kernel.event_publication` 那张登记表（outbox）还没有消费方在用，是留给接真实网关后的退款的。热点只读只有首页三块配置 / 类目树与子树 / 店铺公开信息进了 Redis 读缓存（TTL 5 分钟只兜漏接的写路径，新鲜度靠写侧失效），其余只读照旧直接打库；判权、库存、订单状态这类闸门/账本一律不进缓存。名单与「什么才配上缓存」的判据见 [apps/server/AGENTS.md](apps/server/AGENTS.md)「读缓存」节
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
  （超时关单等三条超时线不加分布式锁的理由见 `order/service/OrderTimeoutService` 类注释——落点是条件更新
    - 影响行数判定，正确性不依赖锁；订单号已不依赖进程内序列，改为「毫秒时间戳 + uuidv7 主键随机段派生」，
      见 `order/service/OrderService.insertOrder`）

详细开发规范（常用命令、错误码流程、各领域规范入口）见 [AGENTS.md](AGENTS.md)。

## 数据库与 Redis

默认数据面为云主机（`SHOP_DATASTORE=remote`），Windows 经 SSH 隧道访问 PostgreSQL 18 / Redis 7；本地 WSL 仅作为显式选择的退路。配置来源为 `apps/server/.env`，完整说明见 [AGENTS.md](AGENTS.md)「数据库与 Redis」。

- PostgreSQL：本地 `15432` → 云端回环 `5433`；Redis：本地 `6379` → 云端回环 `6379`。
- `pnpm db:up` 拉起自愈隧道，`pnpm db:down` 临时停止；不自动启用本地备用库。
- 守护规则在 `scripts/tunnel-supervisor.mjs`，CLI 持有真实 SSH、信号与日志。重连前重新检查端口属主；无法确认时拒绝继续。

`pnpm test --project scripts` 离线验证重连、退避与停止，不启动 SSH、不访问云数据面；已纳入 `pnpm test`。

## 文档地图

| 文档                                                   | 内容                                                                                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                 | 通用入口：命令/开发规范/错误码流程/高频硬规则 + 各领域规范索引（AI 与开发者的入口）                                                                                                                             |
| [apps/server/AGENTS.md](apps/server/AGENTS.md)         | 后端规范：架构硬规则、模块边界判据、读缓存、命名三层契约、测试资产                                                                                                                                              |
| [docs/architecture.md](docs/architecture.md)           | 架构总览：模块依赖图、关键链路、全库 ID 策略、前后端 domain 对应                                                                                                                                                |
| [packages/ui-web/DESIGN.md](packages/ui-web/DESIGN.md) | 视觉规则：使用铁律、色彩语义、形状海拔、三端设计画像                                                                                                                                                            |
| [TODO.md](TODO.md)                                     | 进行中任务与近期计划                                                                                                                                                                                            |
| [docs/error-codes.md](docs/error-codes.md)             | 错误码唯一真相源                                                                                                                                                                                                |
| [docs/conventions/](docs/conventions/)                 | 持续维护的约定（前端规范、取数口径论证、权限码表、业务事件日志、[i18n 约定](docs/conventions/i18n.md)、[前端监控](docs/conventions/frontend-monitoring.md)、[可观测性总纲](docs/conventions/observability.md)） |
| [docs/business-rules/](docs/business-rules/)           | 业务规则库：按领域的生效规则，逐条带编号（源自代码；原 docs/decisions/ 设计笔记已并入并归档 git 历史）                                                                                                          |
| [docs/search-design.md](docs/search-design.md)         | 搜索与首页分类导航目标设计（未实现）：统一结果页、复用现有查询起步、SKU 匹配、增强检索与验收                                                                                                                    |
| [docs/reference/](docs/reference/)                     | 外部调研与决策资料（券平台做法对照、[商品搜索方案](docs/reference/search-decision.md)）                                                                                                                         |

## 开发规范

提交信息（Conventional Commits）、常用命令、前端测试写法、UI 组件接入等规范统一见 [AGENTS.md](AGENTS.md)，此处不再重复维护。

后端测试分快慢两环：`mvn test` 跑 `*Test`（单元 + MockMvc 接口层——接口层用 `@SpringBootTest` 起全量上下文连专用库 `shop_test`、由 Flyway 从零跑全量迁移，所以**它也要先有库**），`mvn verify` 追加 `*IT`（真库集成测试）。CI 门禁就是 `mvn verify`：`.github/workflows/ci.yml` 的后端 job 配了 `postgres:18` + `redis:7` 两个 service 容器，并用 `SHOP_DB_PORT: "5432"` 覆盖本地那个 15432 口径（15432 是 Windows 侧端口被占换来的本地约定，见 [AGENTS.md](AGENTS.md)「数据库与 Redis」）。

刷新凭证的定点回归（先确认数据面在位）：

```bash
node scripts/with-datastore.mjs
mvn -f apps/server/pom.xml verify -Dtest=AuthServiceTest,StaffServiceTest -Dit.test=RefreshTokenStoreIT
```

`RefreshTokenStoreIT` 使用真实 Redis 和可控业务时钟，通过签发/轮换/吊销验证 15 秒宽限期两侧，不靠改消费痕迹键或实际等待。没有 HTTP、Redis 键格式或数据库迁移变化。回滚此轮代码不需要回滚数据；已运行的隧道守护需重启才会加载回滚版本。

Lefthook：pre-commit 自动格式化并跑 lint，commit-msg 校验提交信息，pre-push 跑全量 lint / typecheck / 测试 / Java 编译 / SDK 契约漂移检查。
