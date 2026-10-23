# 权限

> 定位：**谁能做什么、能碰哪些数据**的唯一约定。表形状见迁移 `V20261020226000__seller_identity.sql`，
> 这份说代码里怎么用。

## 0. 一句话

认证在入口做一次，权限判断在服务层显式调用；数据归属下沉到列，不靠每个查询记得写条件。

---

## 1. 三套身份域，不是一个 RBAC

| 域   | 账号       | 有没有角色 | 数据归属列                | 入口                     |
| ---- | ---------- | ---------- | ------------------------- | ------------------------ |
| 买家 | `buyer`    | **没有**   | `buyer_id`                | `POST /api/buyer/login`  |
| 卖家 | `operator` | 有         | `merchant_id` / `shop_id` | `POST /api/seller/login` |
| 平台 | `staff`    | 有         | 无（全平台）              | `POST /api/staff/login`  |

合成一个 `user` 表 + `user_type` 字段是这类项目最常见的错：最后每个查询里都在 `if (type == "seller")`。
**三端各自的登录、令牌、注销全部分开**，共用的只有权限点清单这一份。

平台侧三个岗位：`REVIEWER`（审核、治理）、`OPS`（类目、内容、物流、优惠券）、`SUPER_ADMIN`（全部 + 员工管理）。
岗位 → 权限点住 `staff.role_permission`，权限点本身住 `common.permission`（三端共用的总清单）。

**平台身份没有 `shopIds`。** 这个集合为空不代表没权限，而是"这个维度对平台身份不适用"——
所以任何按 `shopIds` 判权的地方都必须先看 `operatorType()`，不能靠集合是否为空去猜。

### 1.1 令牌里带身份类型，不是靠试

三套身份域**共用一把签名密钥**，所以令牌必须带 `typ` 声明。没有它，一个买家的 subject
被拿去查 `seller.operator` 也不会报错——只要 id 撞上就成了一次越权。

`OperatorAuthenticationConverter` 按 `typ` 只走对应那一个 `OperatorResolver`：

```java
OperatorResolver resolver = resolvers.get(operatorType);   // 不认识就拒
CurrentOperator operator = resolver.find(operatorId).orElseThrow(...);
```

**不认识或缺失的 `typ` 一律拒**，不留"查一下再说"的余地——否则将来加一类身份时，
旧代码会静默放行。两个实现声明同一个 `operatorType()` 会在启动阶段报错，不会等到线上。

### 1.2 买家的形状和卖家不同

买家**没有权限点，也没有店铺范围**，`CurrentOperator` 里两个集合都是空的。这不是没做完：

- 买家的边界是「这单是不是我的」，靠数据归属列 `buyer_id` 判
- 给买家塞一套 `Permission` 会把卖家那套 RBAC 拖过来，然后每次判权都要多一个分支
- 空集合在 `Authorizer.check` 里意味着买家做不了任何卖家动作，这正是想要的

判断"这是买家还是卖家"用 `CurrentOperator.operatorType()`，**不要用权限是否为空去猜**。

### 1.2.1 会话：短 access + 轮换的不透明 refresh

- **access 15 分钟**（JWT），被盗窗口就是它；**refresh 7 天**：不透明 32 字节随机串，Redis 只存
  HMAC 摘要（pepper 在应用配置，拖库不可离线枚举），经 httpOnly cookie 只在各自的 `/refresh`
  端点流动，响应体不回发。
- **一次一换**：刷新先原子消费旧码（GETDEL + 消费标记同一发），再签新码。重放旧码在 15 秒宽限期内
  按多标签页竞争静默拒绝，超期判盗用 → 全端吊销 → `410 REFRESH_TOKEN_REUSED`。
- **同设备重登不产孤儿**：签发时原子换掉设备索引指向的旧摘要。没有这一步，登出/改密/重放兜底
  都只按索引吊销最新的那个，旧 refresh 全数存活到 TTL——「改密全端下线」不成立。
- **封号即会话死亡**：刷新在轮换之后回库重查状态，禁用/注销的账号旧码已消费、新码不签发；
  员工禁用额外吊销全部 refresh，把在途 access 也压掉。
- refresh 的生成、存储、轮换、重放裁决全收在 `infra.security.RefreshTokenStore`，subject 对它
  不透明——三个身份域各自认领 `subjectId` 是谁，凭据口径只有一份。

---

## 2. 卖家侧的形状

不是「商家 → 店 → 子账号 → 岗位」那条链，是两棵树 + 两张交叉表：

```
merchant ─┬─ shop
          └─ operator ──[operator_role]── role ──[role_permission]── permission
                  └──────[operator_shop]── shop
```

三个决定的理由：

- **账号挂在商家下面，不挂在店下面**——一个客服必须能同时管多个店
- **账号与角色多对多**——一个人可以既是客服又是运营，权限取并集
- **数据范围独立于角色**——否则会退化成「客服-店A」「客服-店B」，角色数量按店数爆炸

主账号（`is_primary`）拿走全部权限和全部在营店铺。子账号按角色并集 + 授权店铺。表按多账号建，功能先只开主账号。

---

## 3. 代码里的三个入口

认证交给 Spring Security，业务代码只碰后两个：

```java
authorizer.check(Permission.ORDER_REFUND);   // 功能权限
authorizer.checkShop(order.shopId());        // 数据范围
authorizer.current();                        // 当前操作人（谁、哪个商家、哪些店）
```

令牌怎么变成「当前操作人」不归业务管：`SecurityFilterChain` 用 resource-server 校验 Bearer 令牌，
`OperatorAuthenticationConverter` 拿 `sub` 回库解析成 `CurrentOperator` 放进 `SecurityContext`。
**业务代码里没有登录、没有验签、没有 ThreadLocal。**

**身份只有一份来源：Spring Security 的 `SecurityContextHolder`。** 不另建 ThreadLocal——两套上下文一定会漂移，
到时候会出现「日志里是 A 操作、判权用的是 B」，而且只在并发下复现。

登录本身见 `POST /api/seller/login`（`SellerLoginController`）：BCrypt 校验 → `AccessTokenIssuer` 签 HS256 令牌。
登录名不存在和密码不对返回同一句话，否则这个匿名接口就是账号枚举器。

---

## 4. 为什么权限用显式调用，审计用清单记录

两者防的东西不同。

审计要回答「数据从什么变成了什么」，显式调用的入参给不了，注解也给不了——只能由业务在改完之后把 diff 交出来。

权限只回答「这个动作能不能做」。显式调用在这里更好：一眼能扫出某个方法到底要什么权限；而注解会被代理、自调用、`@Transactional` 包一层之后悄悄绕过，出现「以为校验了其实没有」。

---

## 5. 数据范围是硬要求

按 `shopId` 查、改、删的每一个地方，**都必须先 `checkShop(shopId)`**。

这是越权的主要入口，也是最容易漏的一处：功能权限校验对了，忘了范围校验，客服就能看到别人店的订单。改订单、退款、看报表，全都在这条线上。

漏了它不会报错，只会安静地放行。

### 5.1 买家侧是另一条线：归属校验下沉到 service

买家没有权限点也没有店铺范围，所以 `checkShop` 用不上。买家侧唯一的边界是**「这条数据是不是你的」**，
校验点在 service 里（那才有订单上下文），不在 controller。

两条口径必须一致：

| 情况               | 返回              | 为什么                                                                 |
| ------------------ | ----------------- | ---------------------------------------------------------------------- |
| 数据不存在         | 404               | —                                                                      |
| 数据存在但不是你的 | **404，不是 403** | 403 等于告诉对方"这个 id 真实存在"，拿它当枚举器就能确认哪些订单号有效 |

`cancelUnpaid`、`PaymentCommand.confirm`、`findViewByOutTradeNo` 都按这个口径。

**`confirm` 必须带 `buyerId`。** 它会推进支付状态，不带归属校验就等于任何人拿别人的支付单 id
都能"帮别人确认收款"。

---

## 6. 异步上下文会丢

`SecurityContext` 默认只活在当前线程。`@Async`、线程池、`CompletableFuture` 里拿不到操作人，表现为「权限忽然全没了」。

定时任务、消息消费必须显式 `Authorizer.runAs(operator, ...)`，不要指望上下文继承。

同理，**没有隐式兜底身份**：拿不到操作人就抛 `ForbiddenException`。给个匿名兜底是权限系统最典型的自毁方式。

---

## 7. 权限点清单怎么维护

枚举 `Permission` 与表 `common.permission` 在 `Authorizer` 构造时做双向比对，差一个就启动失败，错误信息直接列出「只在库里」「只在代码里」两组。

加权限点 = 一次迁移 + 一行枚举。两处都改，漏一处起不来。

---

## 8. 防线清单

**已落地：**

1. **认证**（Spring Security + resource-server）。令牌签发、验签、过期、签发方校验都由库做；停用账号即使拿着未过期令牌也会被当场拒。
2. **令牌带身份类型**（`typ`），三套身份域按类型分流，不靠 id 碰撞去猜。
3. **会话层**（见 §1.2.1）：refresh 轮换 + 重放裁决 + 设备管理 + 改密/注销全端下线；access 已缩到 15 分钟。
4. **`checkShop` 显式调用**，配机制层与接口层测试（跨店访问必拒）。
5. **买家归属校验下沉到 service**，越权统一返回 404 而不是 403。
6. **ArchUnit 禁原生 SQL**（`ArchitectureTest`）。只有 `common` / `infra` / `api` / `mapper` 四类包能碰 `org.springframework.jdbc`、`java.sql`、`javax.sql`。跑在 `mvn test` 里，违规就是红灯，报错精确到字段和构造参数。已用临时探针验证过它真的会红——空转的规则比没有规则更危险。

**还没落地，按顺序：**

1. **查询层自动加店铺条件**。**等第一个真实查询**：SQL 改写逻辑必须跑在真实语句上才可信，现在一条业务查询都没有，写了就是一段没人执行过的代码，而它一旦错就是越权。**而且它不能靠 ORM 拦截器**——项目里没有 ORM（见 [module-map.md](module-map.md) 第 8.4 节），要做得在 `JdbcClient` 外面包一层。
2. **字段脱敏**：客服看手机号后四位。在序列化层，不在权限层。
3. **第三方登录**（微信/支付宝/Apple）：`login_binding` 表已建，渠道未接。

### 8.1 判权失败曾经是 500

`ForbiddenException` 不继承 `BusinessException`，而 `GlobalExceptionHandler` 里没有它的处理器，
于是一路落进 `Exception` 兜底，对外变成"服务器内部错误"。

这个洞**在没有真实 HTTP 入口时看不见**——判权代码写了，但没人调用过它。补买家入口时实测才暴露出来。

现在 `GlobalExceptionHandler` 显式接住它，回 403 + `PERMISSION_DENIED`。教训：**每加一条异常路径，
都要有一条真的打进去的请求**；只看代码是看不出兜底会不会吞掉它的。

### 8.2 `@Valid` 在判权之前

`@Valid` 由 Spring MVC 在调用 handler 方法体**之前**执行，而判权在方法体里。所以买家打卖家接口时，
**参数不合法会拿到 422 而不是 403**。

这是可接受的：422 什么也没做，而参数合法的买家会撞到 403。但要知道这个顺序，
否则会以为"422 说明判权没生效"。

---

## 9. `mapper` 包是什么

模块内部放数据访问的地方，名字取自 [module-map.md](module-map.md) 第 8.4 节（`JdbcClient` 和手写 SQL 都住这里）。

- `Ledger` 只有规则（配平、幂等），`LedgerStore` 只有 SQL
- `AuditRecorder` 只有清单校验和序列化，`AuditLogStore` 只有 SQL
- 能写原生 SQL 的地方必须是少数、显式、可评审的
- 想绕过数据权限，就得先把代码搬进这四类包之一——评审时绕不过去

## 10. 目录结构由测试守

两条 ArchUnit 规则跑在 `mvn test` 里，改目录前先看它们：

1. **原生 SQL 只出现在四类包**（`common` / `infra` / `api` / `mapper`）。
2. **模块内部只住在 `controller` / `dto` / `service` / `model` / `mapper` / `api` / `events` / `internal` 之一**——这八个名字逐字取自 module-map 第 8.4 节。想加一个子包，先改蓝图。
