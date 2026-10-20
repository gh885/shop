# 商家数据隔离（多租户）

> 后端细则。速查结论见 `apps/server/AGENTS.md`「硬规则」。改隔离相关代码前读这一份。

## 一句话

**隔离画在行上（`shop_id` 列），两道防线：MyBatis 语句改写 + 数据库 RLS。空上下文放行。**

## 为什么是行级而不是独立库 / 独立 schema

三个轴定的：

- **跨商家查询极多**：平台要看全站 GMV、风控、榜单、佣金。独立库下这些是 N 次查询加内存聚合。
- **商家长尾**：几千上万家中小商家，独立库的运维成本压不住团队。
- **隔离强度需求**：普通零售商之间没有物理隔离的合规要求。

独立 schema / 独立库只在「单个商家占全站 GMV 相当比例」或「有合规上的物理隔离要求」时才拆——那时是**大客户单独部署 + 长尾共享**的混合模式，不是整体迁移。当前没到那一步。

## 两道防线各管什么

|                                     | 管什么                                                      | 管不到什么                              |
| ----------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| `ShopTenantHandler`（MyBatis 插件） | MyBatis-Plus 生成的 SQL：自动追加 `shop_id = ?`，插入时补列 | `JdbcTemplate`（各模块 api 包）、Flyway |
| RLS（`V91` 的 policy）              | **所有**走这条连接的语句，含 JdbcTemplate 与原生 SQL        | 超级用户 / 表 owner（见下）             |

两层不是二选一：插件改写的 SQL 更可读（执行计划可预期），RLS 是兜底（绕过应用层也拦得住）。

## 上下文怎么传

`ShopIdHolder`（ThreadLocal）是唯一来源，由 `ShopMembershipFilter` 只在 `/seller/**` 装载：

- 店主：`X-Shop-Id` 头 → 校验 ACTIVE 成员 → 落 ThreadLocal
- 子账号：店铺自带在凭证上，不吃 `X-Shop-Id`；带了别家的头直接 403

`TenantAwareDataSource` 在借出连接时把它写进会话变量 `app.current_shop`，归还前清空。

**为什么归还前必须清空**：连接是池化复用的，不清就会把上一家店的上下文带给下一个请求——那比不做隔离更糟。

## 空上下文放行——这是刻意的取舍

`app.current_shop` 为空时 policy 不过滤。三类入口天然无上下文，必须放行：

1. **Flyway 迁移与种子**（V43/V44 带 TRUNCATE），拒绝会让每次建库失败；
2. **买家侧与平台侧**（`/api`、`/admin`），本就不该按店过滤；
3. **定时任务**（超时关单、物流轮询、退款重试），跨店扫描。

代价是「忘了设置上下文」会退化成不过滤。所以空上下文只允许出现在上述三类入口——卖家请求由过滤器保证必然写入非空值。

## 已知限制（别当它不存在）

**当前连接用户是超级用户（`usesuper=t`），超级用户连 `FORCE ROW LEVEL SECURITY` 也绕过。** 实测：`SET ROLE` 到非超级用户后 policy 才生效（别家 0 行、本店全量）。

也就是说 **RLS 这层现在不生效**，插件那层在生效。要让 RLS 真正起作用，生产库需要：

1. 建一个非超级用户（如 `shop_app`）作为应用连接账号；
2. 迁移仍用 owner 账号跑（Flyway 需要 DDL 权限）；
3. 应用账号对业务表有 DML 权限、对 schema 有 USAGE。

这件事没做，因为动的是部署与数据库账号，属于运维决策。**在那之前，别在文档或 TODO 里把 RLS 写成「已生效」。**

## 清单维护（三处必须同步）

带 `shop_id` 的表登记在三个地方，`TenantTableVocabularyTest` 会核对：

1. `ShopTenantHandler.TENANT_TABLES`
2. `V91__tenant_row_level_security.sql` 的 `tenant_tables` 数组
3. 真实库里 `information_schema.columns` 的 `shop_id` 列（由 `TenantIsolationIT` 核对）

新增一张带 `shop_id` 的表却忘了登记 → 门禁红。这是刻意的：漏登记不会报错，只会静默地多出一张完全不受隔离的表。

## 子表是已知缺口

`orders.items`、`logistics.shipment_lines`、`review.review_items` 等子表没有 `shop_id`，靠父表的 RLS 与归属闸门间接保护。给子表加冗余 `shop_id` 会引入第二写者，收益不抵成本——**这是取舍，不是遗漏**。
