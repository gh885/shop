# 权限

> 定位：**谁能做什么、能碰哪些数据**的唯一约定。表形状见迁移 `V20261020226000__seller_identity.sql`，
> 这份说代码里怎么用。

## 0. 一句话

认证在入口做一次，权限判断在服务层显式调用；数据归属下沉到列，不靠每个查询记得写条件。

---

## 1. 三套身份域，不是一个 RBAC

| 域   | 账号       | 有没有角色 | 数据归属列                |
| ---- | ---------- | ---------- | ------------------------- |
| 买家 | `buyer`    | 没有       | `buyer_id`                |
| 卖家 | `operator` | 有         | `merchant_id` / `shop_id` |
| 平台 | `staff`    | 有         | 无（全平台）              |

合成一个 `user` 表 + `user_type` 字段是这类项目最常见的错：最后每个查询里都在 `if (type == "seller")`。
**三端各自的登录、令牌、注销全部分开**，共用的只有权限点清单这一份。

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
2. **`checkShop` 显式调用**，配机制层与接口层测试（跨店访问必拒）。
3. **ArchUnit 禁原生 SQL**（`ArchitectureTest`）。只有 `common` / `infra` / `api` / `mapper` 四类包能碰 `org.springframework.jdbc`、`java.sql`、`javax.sql`。跑在 `mvn test` 里，违规就是红灯，报错精确到字段和构造参数。已用临时探针验证过它真的会红——空转的规则比没有规则更危险。

**还没落地，按顺序：**

1. **刷新令牌**。现在 access 是 2 小时、没有 refresh。代价说清楚：**令牌泄露的窗口是小时级**，且用户每两小时被踢一次。做完刷新应把 access 缩到 15 分钟。
2. **查询层自动加店铺条件**（MyBatis 拦截器）。**等第一个真实查询**：SQL 改写逻辑必须跑在真实语句上才可信，现在一条业务查询都没有，写了就是一段没人执行过的代码，而它一旦错就是越权。
3. **字段脱敏**：客服看手机号后四位。在序列化层，不在权限层。
4. **会话管理**：多设备、主动吊销、改密踢下线、异地登录。

## 9. `mapper` 包是什么

模块内部放数据访问的地方，名字取自 [module-map.md](module-map.md) 第 8.4 节（MyBatis Mapper 和手写 SQL 都住这里）。

- `Ledger` 只有规则（配平、幂等），`LedgerStore` 只有 SQL
- `AuditRecorder` 只有清单校验和序列化，`AuditLogStore` 只有 SQL
- 能写原生 SQL 的地方必须是少数、显式、可评审的
- 想绕过数据权限，就得先把代码搬进这四类包之一——评审时绕不过去

## 10. 目录结构由测试守

两条 ArchUnit 规则跑在 `mvn test` 里，改目录前先看它们：

1. **原生 SQL 只出现在四类包**（`common` / `infra` / `api` / `mapper`）。
2. **模块内部只住在 `controller` / `dto` / `service` / `model` / `mapper` / `api` / `events` / `internal` 之一**——这八个名字逐字取自 module-map 第 8.4 节。想加一个子包，先改蓝图。
