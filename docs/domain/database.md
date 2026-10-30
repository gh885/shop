# 数据库管理

> 所有「建表、改表、查表、分表」动作的唯一约定。**判据先于方案**：先回答"到什么规模才需要它"，再决定要不要做。
>
> 与 [module-map.md](module-map.md) 的关系：那份说模块边界，这份说模块在库里的落地形状。模块名就是 schema 名，一一对应。

## 0. 一句话

一个模块一个 schema，一个 Flyway 管全局顺序，版本号用时间戳；DDL 只增不删；分片的形状第一天留好，实现等数据逼。

---

## 1. Schema 归属

- **schema 名 = 模块名**，如 `catalog`、`trade`、`clearing`。和四层分类无关，纯按包名走。
- **跨 schema 不 JOIN、不建外键。** 引用完整性靠三处：写入时校验、读时容忍缺失、日终对账。
- **一个 schema 只有归属模块能读写。** 由 ArchUnit 拦（`*Repository` / `*Mapper` 只能 import 自己模块的），不靠自觉。
- **`public` 只放第三方库自带的表**，业务表一律不进。理由不是洁癖：`event_publication` 这类表的表名被库写死成一个字符串常量，没有任何配置能把它挪进别的 schema（见第 2 节末尾）。既然挪不动，就给它划一块专属地。
- **`common` 放不归属任何模块的基础设施表**：发号表 `biz_sequence`、消费去重表 `consumed_event`。

为什么不建外键：外键把两个模块的写入顺序绑死，也让分库分表、归档、批量导入全部失效。它换来的完整性，本来就该在对账里做——而你要对账无论如何都得做。

### 事件相关的两张表

| 表                         | 谁写                  | 干什么                                                          |
| -------------------------- | --------------------- | --------------------------------------------------------------- |
| `public.event_publication` | Spring Modulith，自动 | outbox 存储侧：发布与业务同事务落库，消费后补 `completion_date` |
| `common.consumed_event`    | `EventInbox.claim()`  | 消费去重：`(consumer, event_id)` 主键挡第二遍                   |

两条使用约束：

- **业务代码不许手写这两张表。** 一张由框架管，一张只经 `EventInbox` 进。
- 两张都会无限长大。`consumed_event` 按 30 天删旧行（走 `idx_consumed_event_consumed_at`）；`event_publication` 里已完成的按 7 天删。清理任务等第一个真事件上线再写，现在表是空的。

### 只追加表

有七张表装了 `common.reject_mutation()` 触发器，**应用账号即使是表属主也改不掉已写入的行**：

| 表                            | 为什么不能改                                 |
| ----------------------------- | -------------------------------------------- |
| `audit.entry`                 | 审计能被 UPDATE 就只是装饰                   |
| `clearing.ledger_entry`       | 纠错只能开反向分录，不能改历史账             |
| `clearing.posting_group`      | 幂等键一旦可变，重复提交就防不住             |
| `clearing.reconciliation_run` | 对账结果能被改，等于改"当时账本什么样"的证词 |
| `inventory.stock_ledger`      | 库存流水能被改，账实就永远对不上             |
| `trade.order_event`           | 状态迁移记录能被改，等于没有记录             |
| `returns.case_log`            | 售后状态和判责历史能被改，等于没有留痕       |

`governance.violation`、`governance.enforcement_action` 还没建表；建表迁移把触发器一起带上，回来补这两行。

触发器只管 DML。分区维护（`DROP PARTITION`）、`TRUNCATE` 这些 DDL 不受影响——这正是想要的：日常清理能删整月分区，但改不掉任何一行。

为什么不用 `GRANT` 兜底：本地开发时迁移账号和应用账号是同一个，属主自己就有全部权限，`GRANT` 拦不住。触发器是唯一对属主也生效的护栏。生产必须分账号，但那是第二道。

---

## 2. 迁移规范

**工具**：Flyway。脚本在 `apps/server/src/main/resources/db/migration`。

**版本号**：14 位时间戳 `yyyyMMddHHmmss`（本地时区）。不用自增整数——两个人同时加 `V42` 就是冲突，而冲突在合并时才暴露。

**命名**：`V<版本>__<模块>_<动词><对象>.sql`，例如 `V20261020143000__catalog_add_sku_spec.sql`。

**一个文件一个意图。** 一个迁移干五件事，失败了定位不到是哪一步。宁可五个文件。

**每个文件头必须有三行；少一行就是隐患**：

```sql
SET lock_timeout = '3s';
SET statement_timeout = '60s';
```

不设的后果：一条排队等锁的 `ALTER` 会把它后面所有查询一起堵死。千万级表上这叫雪崩，不叫慢查询。

**其他规矩**：

- 只向前，不写 undo。回滚 = 再写一个迁移改回去。
- **迁移文件合进 `main` 之后不许再改**。Flyway 校验和会变，已部署环境直接启动失败。
- 不用 `spring.jpa.hibernate.ddl-auto`，也不许用任何 ORM 自动建表。**库的形状只有一个来源：迁移脚本。**
- 迁移不许依赖任何 Java 代码（不调 `@Component`、不读配置类）。它必须能在只连数据库的 `psql` 里独立跑。

**Flyway 必须显式指定 schema，这是踩过的坑**：

```yaml
spring:
    flyway:
        default-schema: common
        schemas: common
        create-schemas: true
```

不配的话，Flyway 拿 JDBC 连接 `search_path` 的首项当默认 schema——而 PG 的默认 `search_path` 是 `"$user", public`，于是它把**数据库用户名**当成了 schema 名，在库里凭空建出一个和用户名同名的 schema，再把 `flyway_schema_history` 塞进去。更糟的是报错信息只说"schema 非空"，看起来像数据问题。

历史表和基础设施表一起住 `common`，`public` 全程留空。

---

## 3. DDL 铁律

四条，破了任何一条都是线上事故。

**适用边界**：铁律管的是「已合入 `main`、表里可能有数据」的世界。上线前的迁移只碰空表，
`DROP COLUMN`、普通 `CREATE INDEX` 都允许——expand/contract 和 `CONCURRENTLY` 在空表上
只有成本没有收益；但删改的理由写进文件头注释，评审时看得见。合入 `main` 之后没有例外。

**① 只增不删，分两步改（expand / contract）**

```
发版 1：加新列（可空）→ 代码双写新旧两列
发版 2：回填历史数据 → 切读新列
发版 3：删旧列
```

任何"一个迁移里 RENAME 列"的写法都是停机。改列名、改语义、拆表，全走这条。

新增列必须**可空**或**带常量 DEFAULT**（PG 11+ 加常量默认值不重写表）。要 `NOT NULL` 就分两步：先加可空列，回填完再加约束。

**② 加索引必须 `CREATE INDEX CONCURRENTLY`**

普通 `CREATE INDEX` 会锁写。千万行表上锁几分钟，等于停服。

它不能在事务里跑，所以必须单独一个迁移文件，并在文件头加：

```sql
-- flyway:executeInTransaction=false
CREATE INDEX CONCURRENTLY idx_order_group_buyer_created ON trade.order_group (buyer_id, created_at DESC);
```

注意：`CONCURRENTLY` 失败会留下一个 `INVALID` 索引，必须手工 `DROP INDEX` 后重跑，Flyway 不会自动清理。

**③ 迁移会话必须设超时**（见上节）

**④ 禁止 `ALTER COLUMN TYPE`**

改类型等于重写整表。走"新列 + 回填 + 切读 + 删旧列"。

少数安全例外：`varchar(50)` → `varchar(100)` 这类只放宽长度的改动不重写表，可以做。

---

## 4. 主键与业务号

三套东西，别混用。

**主键：`uuid`，由 PG 的 `uuidv7()` 生成。**

不用自增 `bigint`：分库分表后自增必然要改造，而且自增 ID 会把业务量暴露给外部。

不用 `uuidv4`：v4 完全随机，B-tree 插入是随机写页，表一大就碎片化。v7 前 48 位是毫秒时间戳，插入是顺序追加。

```sql
id uuid PRIMARY KEY DEFAULT uuidv7()
```

**对外业务号：`BizNo`，本地生成，不查库。**

形状 `前缀 + yyyyMMdd + 12 位随机`，如 `SO20261020K7M2Q4Z8X1AB`。

- 随机段 12 位 Crockford base32（60 bit），一天一千万单的碰撞概率约 4e-5
- 库里加唯一索引兜底，撞了就重生成一次
- **允许空号**，因为它是随机的。所以只用于订单号、支付流水号这类"看起来要连续、其实不用连续"的号

**连续号段：`BizSequence`，走库行锁。**

只用于**不能有空号**的号：凭证编号、发票号、对账单号。

为什么不用 PG 的 `SEQUENCE`：sequence 的值在事务回滚时不回退，必然留空号。`common.biz_sequence` 是一行普通数据，更新和业务写在同一个事务里，回滚就一起回滚。

代价是同一 `(ns, period)` 上串行排队，所以**高频号不能用它**。

**三个的判据**：

| 用途                       | 用什么        | 允许空号 |
| -------------------------- | ------------- | -------- |
| 表主键 / 事件 ID           | `uuidv7()`    | —        |
| 订单号 / 支付流水号        | `BizNo`       | 是       |
| 凭证号 / 发票号 / 对账单号 | `BizSequence` | 否       |

---

## 5. 索引

- 命名：普通索引 `idx_<表>_<列>`，唯一索引 `uq_<表>_<列>`。
- **每个索引必须能对应上一条真实查询。** 对应不上的索引是纯负债：拖慢写入、占空间、还得维护。
- 复合索引按"等值列在前、范围列在后"排。`(buyer_id, created_at DESC)` 能服务"我的订单按时间倒序"，`(created_at, buyer_id)` 服务不了。
- 唯一约束优先做成唯一索引，别用 `UNIQUE CONSTRAINT` + 额外索引两份。
- 分区表上的唯一索引必须包含分区键，否则建不出来。
- 部分索引能做小就做小：软删除的表用 `WHERE deleted_at IS NULL`。

### 词汇表（一个概念全库一个词）

- **seller vs merchant**：`seller` 是视角词（卖家侧的模块与表：seller schema、`seller_order`），
  `merchant` 是实体词（归属外键一律 `merchant_id`）。`seller_order.merchant_id` 不是分叉——
  视角词管表名，实体词管外键。
- **操作者一律 operator**：事件流、审计、库存流水的两列是 `operator_type / operator_id`，
  与安全层 `CurrentOperator` 同源。不用 actor。
- **jsonb 载荷键用 camelCase**：载荷（`shipping_template.regions` 的 `areaCodes`、地址快照）
  是对外契约的一部分，跟随 JSON 惯例；列名才管 snake_case。
- **账本词汇**：只追加的账叫 ledger / entry（`stock_ledger`、`ledger_entry`、`audit.entry`），
  不叫 log；占用叫 hold 不叫 freeze；可售量全称 `available_to_promise`，不写裸缩写。

---

## 6. 容量与分片

**判据**（三条命中任意一条才考虑）：

- 单表 > 2000 万行
- 单库 > 1TB
- 写入 QPS > 5000

**不到就不用。** 提前分片的代价是全链路变复杂，而收益要几年后才兑现。

**现在只做一件事：所有业务表第一天就带上分片键列。** 哪怕暂时不建索引、不加约束。真到要分的那天，不用改表结构，只加路由。

分片键按视角选：

- 买家侧的表 → `buyer_id`
- 卖家侧的表 → `merchant_id`（收款主体）
- 订单三层（`order_group` / `seller_order` / `order_line`）→ 共用 `group_id` 的哈希

**订单三层必须同分片键。** 落单要在同一事务里插 group + seller_order + line，按 `buyer_id` 和 `merchant_id` 分开分片就没法一个事务。买家侧和商家侧各建一张异构索引表，按自己的视角查。

**分片中间件**：Java 内嵌方案用 ShardingSphere-JDBC（无额外进程），而不是 Proxy——单体阶段多一个代理进程就是多一个故障点。

---

## 7. 连接与观测

**连接池**：HikariCP `maximumPoolSize` 定 20–30。

别按"并发用户数"设。PG 每个连接一个操作系统进程，池子开大换来的是上下文切换和内存争抢，吞吐反而降。到两百连接这个量级再上 PgBouncer（transaction 模式）。

**第一天就开的四个开关**：

- `pg_stat_statements` 扩展——没它你查不出慢在哪，只能猜
- 慢查询阈值 200ms，落日志
- 锁等待视图（`pg_locks` + `pg_blocking_pids()`），做成只读接口
- 膨胀与索引命中率定时快照（`n_dead_tup` / `idx_scan`）

**监控只盯三个数**：最慢的三条 SQL、最长的一次锁等待、单表行的增速。其他都是噪音。

---

## 8. 禁止清单

一条一行，都是真踩过的坑。

- 跨 schema JOIN
- 在代码里拼 SQL 建表 / 改表
- `SELECT *`
- 没有 `LIMIT` 的列表查询
- 在事务里调用外部 HTTP（事务被网络延迟拉长，锁持有时间失控）
- 用 `OFFSET` 做深分页（第 10 万页扫 10 万行）——用游标分页
- 把 `created_at` 存成字符串
- 金额用 `float` / `double`（必须 `bigint` 存分 + `char(3)` 存币种）
- 时间用本地时区无偏移类型（必须 `timestamptz`）
- 大批量 `DELETE` 不分批（一次删百万行会锁爆 + WAL 暴涨，分 1000 一批）

---

## 9. 多环境

| 环境    | 库                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| local   | `compose.dev.yml` 的 PG 18，端口 15432，可随时 `down -v` 重来                                                                           |
| test    | Testcontainers 自起的 PG 18 + Redis（`testsupport/IntegrationTest`，`@ServiceConnection` 接线），每例前 TRUNCATE 全库并回植迁移种子基线 |
| staging | 托管 PG，与 prod 同构但小一号，用来验证迁移                                                                                             |
| prod    | 托管 PG，**应用账号没有 DDL 权限**，迁移用独立账号跑                                                                                    |

最后一条是硬要求：应用账号只有 `SELECT/INSERT/UPDATE/DELETE`，迁移账号才有 `CREATE/ALTER/DROP`。否则一次代码 bug 就能改掉线上表结构。

## 维护

这份文档随第一条迁移一起建立。**新增一张表或一次迁移，先回来对一遍第 3 节和第 8 节。**
