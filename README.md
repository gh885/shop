# Shop — 多商家货架型平台电商

多商家货架型平台电商（Marketplace）。纯软件平台：**不持有商品和库存，不执行履约配送**。平台负责商品治理、交易撮合、算价优惠、订单支付、分账结算、售后仲裁和商家治理；履约由商家或第三方物流完成，平台只做状态跟踪。

这条定位决定边界：**持有实物的事在平台之外，记录和裁决的事在平台之内。** 库存、物流、价格这些事实由商家提供，平台保存一份用于撮合和判责的副本；平台自己的账是钱账和操作账——分账结算与审计，不是货账。

## 当前状态

后端在**重写期**，前端三端还没跟上来。

- 模块目录按蓝图一次建全：30 个模块 = 30 个顶层包 = 30 个 PG schema，每个目录带一份 README，头部是可机读的模块声明
- 有代码的只有 3 个：`audit` / `seller` / `clearing`，其余 27 个只有形状
- 文档先行：100 个必须被回答的问题见 [docs/questions.md](docs/questions.md)，每题的答案标了落在哪份设计文档

这里没有「已实现功能」一节，因为现在没有可用功能。等第一批纵切落地再恢复。

## 技术栈

| 层     | 技术                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| 前端   | TanStack Start (React 19, TypeScript 7, Tailwind v4) 跑在 **Vite+ 1.0** 上                          |
| 后端   | Spring Boot 4.1 + Spring Modulith 2.1 + REST + MyBatis-Plus 3.5                                     |
| 数据库 | PostgreSQL 18（schema 隔离）+ Redis 7                                                               |
| 工具   | Maven + **Vite+ `vp`**（Vite 8 / Rolldown、Vitest 5、Oxlint、Oxfmt）+ pnpm 12 + Lefthook + Spotless |

## 前置要求

- Java 25 + Maven
- Node.js 22.18+ / 24.11+ / 26+（Vite+ 的 engines 口径；pnpm 版本由 `package.json` 的 `devEngines` 与 lockfile 记死，装依赖用 `vp install`）
- Docker（PostgreSQL 18 + Redis 7 走 `compose.dev.yml`；OSS / MQ / 搜索是可选 profile）

## 快速开始

```bash
pnpm db:up                  # PG 18 + Redis，localhost:15432 / 6379
pnpm dev:server             # 后端 http://localhost:8080
pnpm --filter web dev       # 买家端 http://localhost:3000
pnpm dev                    # 前后端一起
```

首次启动自动建本地种子账号（商家 + 店铺 + 主账号 `boss`），密码取 `apps/server/.env` 的 `SHOP_SEED_PASSWORD`。没设这个变量就不建——它是研发脚手架，不是生产后门。

## 目录结构

```
shop/
├── apps/
│   ├── web/        买家端 SSR（TanStack Start，3000）
│   ├── seller/     卖家工作台 SPA（5000）
│   ├── admin/      平台管理端 SPA（4000）
│   └── server/     Spring Boot 模块化单体（8080）→ 30 个模块，见 apps/server/README.md
├── packages/       api / client / common / i18n / monitoring / app-kit / ui-web / config / test-utils
├── contracts/      跨端契约单一来源：错误码、权限码、路由、i18n
├── docs/           设计文档，唯一索引是 docs/README.md
├── compose/        本地容器初始化脚本
└── scripts/        校验与生成脚本（模块图、密钥扫描、契约漂移）
```

## 架构原则

**模块 = 顶层包 = PG schema**，三者一对一，由 Spring Modulith 与 ArchUnit 强制校验。模块之间只走对方 `api/`（同事务同步调用）或 `events/`（纯通知），不跨 schema JOIN，也不建外键——引用完整性靠写入校验、读取容忍、日终对账。

这是**强一致优先**的单体取舍，不是「随时可拆微服务」：拆任何一个模块，都要先把同事务命令改成 saga 或最终一致。模块图与依赖方向见 [docs/domain/module-map.md](docs/domain/module-map.md)。

```bash
pnpm modules:check    # 读 30 份模块 README，校验 schema 唯一、依赖不悬空、无环、事件双向
```

## 文档

唯一索引是 [docs/README.md](docs/README.md)。三个常用入口：

- 这套设计要回答什么问题 → [docs/questions.md](docs/questions.md)
- 模块怎么切、依赖往哪走、事件怎么发 → [docs/domain/module-map.md](docs/domain/module-map.md)
- 某个包该放什么、别放什么 → 各目录下的 `README.md`

## 开发规范

常用命令、技术硬规则、各包约束见 [AGENTS.md](AGENTS.md)。门禁由 Lefthook 持有：pre-commit 格式化 + lint + 密钥扫描，commit-msg 校验提交信息，pre-push 跑全量检查。后端测试 `pnpm test:server` 需要先 `pnpm db:up`。
