# 后端（apps/server）

Spring Boot 4.1 + Spring Modulith 的模块化单体。**当前处于重写期**：只落了地基，还没有业务模块。

## 怎么跑

```bash
docker compose -f compose.dev.yml up -d      # PG 18 + Redis，别的 profile 按需
pnpm dev:server                              # 或 mvn -f apps/server/pom.xml spring-boot:run
pnpm test:server                             # mvn test，需要上面那个库跑着
```

首次启动会自动建本地种子账号（商家 + 店铺 + 主账号 `boss`），密码取自 `apps/server/.env` 的 `SHOP_SEED_PASSWORD`。
没设这个变量就不建——它是研发本地的脚手架，不是生产后门。

## 目录

```
src/main/java/com/shop/platform/
├── common/     纯契约：发号、事件接口、错误码词表、校验规则词表、Money
├── infra/      基础设施：web（错误处理/请求 id）、security（认证与判权）、event（消费去重）
├── audit/      模块：操作审计（平台能力里唯一有自己表的）
├── seller/     模块：商家、店铺、子账号、角色与授权
├── clearing/   模块：资金账务（账户 / 分录组 / 分录）
├── trust/      模块：售卖资格（状态 / 类目授权 / 品牌授权 / 资质）
├── catalog/    模块：类目、属性、品牌、SPU/SKU、offer 发布
├── inventory/  模块：单账本库存（四科目 / 预占 / 流水）
├── promotion/  模块：只有 api 契约（AppliedRule / PromotionQuery），规则表未做
├── pricing/    模块：算价（五层流水线 / 报价单证据 / 最大余数法）
└── trade/      模块：订单三层（落单 / 取消 / 超时关单 / 订单事件）
```

模块与 schema 一一对应，模块内部只住 `controller / dto / service / model / mapper / api / events / internal`。
完整蓝图见 [module-map.md](../../docs/domain/module-map.md)，各目录的职责见同级的 `README.md`。

## 三十个模块，八个有代码

目录按 module-map 的蓝图一次建全：**30 个模块 = 30 个顶层包 = 30 个 schema**，每个目录有自己的
`README.md`，头部是一段机器可读的 yaml（层、schema、状态、依赖、发/收事件）。

现在有代码的 8 个：`audit` / `seller` / `clearing` 是完整实现，`catalog` / `trust` / `inventory` / `pricing` / `trade` 是骨架（商品发布、售卖资格、库存预占与释放、算价与报价单、落单与关单），其余 22 个还是形状。

```bash
pnpm modules:check     # 读全部 README 的 yaml 块，检查模块图闭不闭合
```

它核四件事：schema 唯一、`depends_on` 不悬空、模块级无环、事件双向闭合。前三件是硬错（退出码非零），
第四件只报告——把「还没设计」写成「已经设计」，比缺口本身更坏。

## 三道守卫（都跑在 `mvn test` 里）

1. **原生 SQL 只出现在四类包**：`common` / `infra` / `api` / `mapper`。绕过了数据范围和审计就没意义。
2. **模块内部只住在蓝图那八个子包**。想加子包，先改文档。
3. **错误码注册表与 Java 常量双向对拍**：`contracts/error-codes.yaml` ⇄ `ErrorCodes`。

## 闭环状态

按淘宝那套模型去要求，八个环里闭上了一个（事件），其余七个还断着。这不是缺陷清单，是**接下来的路线**。

| #   | 环       | 已经到哪                                          | 断在哪                                                   |
| --- | -------- | ------------------------------------------------- | -------------------------------------------------------- |
| 1   | 资金     | 分录能记、守恒可验、冲正可做                      | 支付回调 → 清算单 → 结算单 → 打款，四段全缺，钱出不去    |
| 2   | 认证     | 登录发令牌、验签、判权、停用即拒                  | 没有刷新令牌，access 到期只能重新登录                    |
| 3   | 事件     | 同事务落库、消费去重、失败补发、卡住告警          | 多实例缺数据库锁，会重复投递                             |
| 4   | 审计     | 记录器 + 只追加表 + 清单；`catalog` 在调它        | 只有商品发布在写审计，库存调整与订单还没接               |
| 5   | 数据范围 | `checkShop` 显式调用                              | 没有查询层强制，漏调不报错，只安静放行                   |
| 6   | 错误码   | Java 侧对拍、ProblemDetail 契约                   | TS 侧没对拍；注册表里大半的码还没有抛出点                |
| 7   | 会计期间 | 分录有 `biz_date` 列                              | 没有日切机制决定「业务日期」是谁，跨日冲正会落错期间     |
| 8   | 下单     | 报价 → 占库存 → 落三层订单 → 发事件，全在一个事务 | 没有 HTTP 入口；支付与退款事件没人消费；超时任务没接调度 |

另外三件属于「知道没做，不算断」：分库分表、读写分离、消息队列。判据写在
[database.md](../../docs/domain/database.md) 第 6 节，不到就不上。

## 文档

- 模型与蓝图：[docs/README.md](../../docs/README.md)（唯一索引）
- 目录级说明：各目录下的 `README.md`，只讲「这里放什么、别放什么、怎么加东西」
- 为什么这么设计：`docs/domain/` 下的五份
