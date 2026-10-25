# 文档

> **唯一入口。** 后端已清空重建，这里只剩重写蓝图；旧的业务规则、约定、ADR 已随代码一起删除（`main` 分支仍可查）。

| 我要…                                            | 读                                                         |
| ------------------------------------------------ | ---------------------------------------------------------- |
| 知道这套设计要回答哪些问题、答案落在哪份文档     | [questions.md](questions.md)                               |
| 知道有哪些模块、怎么分层、依赖往哪走、事件怎么发 | [domain/module-map.md](domain/module-map.md)               |
| 知道 SPU/SKU/标准品怎么切、谁能上架              | [domain/product-model.md](domain/product-model.md)         |
| 知道价格怎么算、优惠怎么摊到每一行               | [domain/pricing.md](domain/pricing.md)                     |
| 知道库存怎么扣、为什么不会超卖                   | [domain/inventory.md](domain/inventory.md)                 |
| 知道订单怎么拆、状态怎么表示、竞态怎么兜         | [domain/order-model.md](domain/order-model.md)             |
| 知道包裹怎么拆、轨迹码怎么翻译、什么时候自动收货 | [domain/fulfillment.md](domain/fulfillment.md)             |
| 知道售后怎么判责、超时谁兜、钱从哪个口袋退       | [domain/after-sale.md](domain/after-sale.md)               |
| 知道商家怎么入驻、扣分、申诉、清退               | [domain/seller-governance.md](domain/seller-governance.md) |
| 知道业务代码开工前要先打好哪些地基               | [domain/platform-baseline.md](domain/platform-baseline.md) |
| 知道表怎么分、迁移怎么写、DDL 守什么             | [domain/database.md](domain/database.md)                   |
| 知道钱怎么记、分录怎么平、和审计什么关系         | [domain/ledger.md](domain/ledger.md)                       |
| 知道谁能做什么、数据怎么隔离、越权怎么防         | [domain/access-control.md](domain/access-control.md)       |
| 知道出错时返回什么、错误码怎么加                 | [domain/errors.md](domain/errors.md)                       |

## 跨文档对账表

改任何一份文档前先过这张表。同一件事只准有一种写法，写两处必然漂。

| 事实         | 唯一口径                                                                                                                                                                                    | 谁在管                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 行金额       | `order_line.payable = subtotal − discount`，**不含运费**                                                                                                                                    | order-model §2.5、pricing     |
| 行号映射     | `order_line.line_no` 沿用 `price_quote_line.line_no`，不重编号                                                                                                                              | order-model §2.5              |
| 运费归属     | 挂在 `seller_order` 上，不摊到行；整单退才退                                                                                                                                                | order-model §2.5              |
| 三层金额恒等 | `Σ line = seller`、`Σ seller = group`，`CHECK` 兜不住，落单后跑核对                                                                                                                         | order-model §2.7              |
| 取消金额     | `cancelled_amount = cancelled_subtotal − cancelled_discount`，三层恒等式都扣掉取消部分                                                                                                      | order-model §2.7              |
| 关闭语义     | `closed_at` 是独立列，不是 `payment_status` 的值                                                                                                                                            | order-model §2.2              |
| 退款状态     | `RefundSucceeded` → `trade` 更新 `refunded_amount` / `payment_status`；`ReturnApproved` → `payment` 执行退款                                                                                | order-model §4、after-sale §4 |
| 商家资格     | `active profile + category_grant + credential + brand_grant`，统一走 `trust.canSell`                                                                                                        | seller-governance §2.3        |
| 库存首键     | `(sku_id, warehouse_id)`；预占幂等键 `(seller_order_id, line_no)`                                                                                                                           | inventory §3                  |
| 识别键分层   | SPU 认型号/款号/参数哈希；SKU 认 GTIN。GTIN 不能挂 SPU                                                                                                                                      | product-model §2.1、§3        |
| 优惠优先级   | `priority` 数值小 = 优先；互斥在门槛过滤之后选                                                                                                                                              | pricing §3                    |
| 只追加表     | `audit.audit_log`、`clearing.ledger_entry`、`clearing.posting_group`、`clearing.reconciliation_run`、`inventory.stock_log`、`trade.order_event`、`returns.case_log`（`trust` 两张建表时补） | database §1、各文档           |
| 错误码       | 只认 `contracts/error-codes.yaml`；errors.md 只讲响应形状                                                                                                                                   | errors                        |

## 目录分工

- `domain/` —— **模型是什么**：模块边界、分层、事件契约、地基清单、数据库管理、资金账务、权限、错误、商家治理。
- **代码旁边的 README** —— `apps/server/README.md` 是后端总览与闭环状态；`src/main/java/com/shop/platform/`
  及其下每个模块目录各有一份，只讲「这里放什么、别放什么、怎么加东西」。

**每份模块 README 必须有「模块契约」一节**，写后端内部的进出口，**不写 HTTP 接口的 I/O**：

- **输入**：用了哪个模块的哪个方法、拿到什么形状、**拿不到会怎样**
- **输出**：给了哪个模块什么、什么时候
- **边界**：明确不做什么

三条要求：一屏读完（两张小表 + 几条边界，不是长文）；「拿不到会怎样」必须写，那才是契约真正的语义；
和 yaml 的 `depends_on` 不重复——yaml 说依赖谁，这一节说调什么、什么形状、失败怎么办。
**没有代码的模块不写**：那时写出来的是设想，不是事实。样板见 `pricing/README.md`。

模块图闭不闭合用 `pnpm modules:check` 核：它读各模块 README 的 yaml 块**和** `package-info.java`，检查
schema 唯一、依赖不悬空、无环、事件双向闭合，外加三件框架看不见的事——`api/` 与 `events/` 不许是空目录、
必须有 `@NamedInterface`、README 的 `depends_on` 与注解的 `allowedDependencies` 要对得上。
**事件缺口以 `pnpm modules:check` 的输出为准，不在这份文档里写死数字。**

分工是：**Spring Modulith 管运行中的代码**（`ModularityTest` 的 `verify()` 查命名接口与依赖方向，
`pnpm test:boundaries` 免数据库可跑），**这个脚本管图纸**（未开工的模块、Postgres schema 一对一、
事件闭合）。两边都别指望对方替自己干活。

两层分工：`docs/domain/` 讲**为什么这么设计**，目录 README 讲**这个包里该有什么**。同一个结论不写两遍。

## 维护

新增文档前先问：**能不能并进上面某一份？** 不能的话，在本文加一行入口——不要新建第二个索引。

唯一的例外是 [questions.md](questions.md)：它不是索引，是**验收清单**——列 100 个必须被回答的问题，标了答案在哪份文档。写完一份就回去划掉一批，划不掉的说明那份没写透。

目录 README 例外：它能就地长出来，但只写本目录的事，不复制 `docs/domain/` 里的论证。
