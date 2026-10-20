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
├── common/     纯契约：发号、事件接口、错误码词表、校验规则词表
├── infra/      基础设施：web（错误处理/请求 id）、security（认证与判权）、event（消费去重）
├── audit/      模块：操作审计（平台能力里唯一有自己表的）
├── seller/     模块：商家、店铺、子账号、角色与授权
└── clearing/   模块：资金账务（账户 / 分录组 / 分录）
```

模块与 schema 一一对应，模块内部只住 `controller / dto / service / model / mapper / api / events / internal`。
完整蓝图见 [module-map.md](../../../docs/domain/module-map.md)，各目录的职责见同级的 `README.md`。

## 三道守卫（都跑在 `mvn test` 里）

1. **原生 SQL 只出现在四类包**：`common` / `infra` / `api` / `mapper`。绕过了数据范围和审计就没意义。
2. **模块内部只住在蓝图那八个子包**。想加子包，先改文档。
3. **错误码注册表与 Java 常量双向对拍**：`contracts/error-codes.yaml` ⇄ `ErrorCodes`。

## 闭环状态

按淘宝那套模型去要求，八个环里有八个没闭上。这不是缺陷清单，是**接下来的路线**。

| #   | 环       | 已经到哪                         | 断在哪                                                |
| --- | -------- | -------------------------------- | ----------------------------------------------------- |
| 1   | 资金     | 分录能记、守恒可验、冲正可做     | 支付回调 → 清算单 → 结算单 → 打款，四段全缺，钱出不去 |
| 2   | 认证     | 登录发令牌、验签、判权、停用即拒 | 没有刷新令牌，access 到期只能重新登录                 |
| 3   | 事件     | 与业务同事务落库、消费去重       | 没有补发任务：进程崩了，未完成的事件没人重投          |
| 4   | 审计     | 记录器 + 只追加表 + 清单         | **没有任何业务代码在调它**                            |
| 5   | 数据范围 | `checkShop` 显式调用             | 没有查询层强制，漏调不报错，只安静放行                |
| 6   | 错误码   | Java 侧对拍、ProblemDetail 契约  | TS 侧没对拍；注册表里大半的码还没有抛出点             |
| 7   | 会计期间 | 分录有 `biz_date` 列             | 没有日切机制决定「业务日期」是谁，跨日冲正会落错期间  |
| 8   | 多租户   | 只有 `merchant_id`（数据归属）   | 文档说的 `tenant`（运营主体 / 业务线）一张表都没有    |

另外三件属于「知道没做，不算断」：分库分表、读写分离、消息队列。判据写在
[database.md](../../../docs/domain/database.md) 第 6 节，不到就不上。

## 文档

- 模型与蓝图：[docs/README.md](../../../docs/README.md)（唯一索引）
- 目录级说明：各目录下的 `README.md`，只讲「这里放什么、别放什么、怎么加东西」
- 为什么这么设计：`docs/domain/` 下的五份
