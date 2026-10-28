# seller — 商家与账号

```yaml
module: seller
layer: 支撑域
schema: seller
status: implemented
depends_on: ["audit :: api"]
emits: []
consumes: ["SellerSuspended", "CategoryGrantRevoked", "CredentialExpired"]
```

支撑域。schema：`seller`。权限模型见 [access-control.md](../../../../../../../../../docs/domain/access-control.md)。

## 模块契约

| 方向 | 对象             | 内容                                                                                                         |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| 输入 | —                | 不消费事件。治理判定归 `governance`，将来真要在这里查资质再加 `governance :: api`                            |
| 输入 | `audit :: api`   | `record(AuditEntry)`：运费模板的建、改、上下线各留一条痕（`byMerchant`）                                     |
| 输出 | `pricing :: api` | `activeFor(shopId)` → `FreightRule`：计费口径、包邮门槛、地区费率；`nameOf(shopId)` → 店名（结算页分组展示） |
| 输出 | `infra` 的 SPI   | `SellerOperatorResolver`：把令牌里的卖家 id 解析成 `CurrentOperator` + 数据范围                              |

**只给规则，不算钱。** 运费模板的金额由 pricing 算——包邮门槛要看折后金额，而折后金额只有算价知道。

**不做商家治理**：扣分、处置、申诉归 `governance`；平台内部员工归 `staff`，不并进来。

## 形状不是一条链

文档里常把淘宝讲成「会员 → 店 → 子账号 → 岗位」，**那条链不存在**。真实结构是两棵树 + 两张交叉表：

```
merchant ─┬─ shop
          └─ operator ──[operator_role]── role ──[role_permission]── permission(common)
                  └──[operator_shop]── shop
```

三处关键，每处都对应一个会被踩的坑：

- **账号挂在 merchant 下，不挂在 shop 下** —— 一个客服要能同时管多个店
- **账号与角色多对多** —— 一个人可以既是客服又是运营，权限取并集
- **数据范围独立于角色** —— 塞进角色会退化成「客服-店A」「客服-店B」，角色数量按店数爆炸

## 目录

```
seller/
├── controller/  SellerLoginController（登录）、SellerShippingTemplateController（运费模板六个端点）
├── service/     SellerLoginService（密码校验 + 签发令牌）、ShippingTemplateService（模板状态机）
├── dto/         SellerLoginRequest、ShippingTemplateRequest
├── model/       ShippingTemplateStatus（draft / active / archived）
├── mapper/      OperatorCredentialMapper（登录用凭证）、LocalAccountSeed + LocalAccountSeedMapper（本地种子）、
│                ShippingTemplateMapper（运费模板读写，唯一碰 seller.shipping_template 的地方）、
│                ShippingTemplateStore（ShippingTemplateQuery 的读侧实现）、ShippingTemplateMapper、
│                ShopQueryImpl + ShopMapper（店名点查）、OperatorCredentialMapper、LocalAccountSeedMapper
└── api/         SellerOperatorResolver（infra 的 OperatorResolver SPI）、
                 ShippingTemplateQuery + FreightRule（给 pricing 的运费规则值对象）、
                 ShopQuery（店名点查）
```

`api/` 配了 `@NamedInterface("api")`——它是这个模块对外的唯一入口。

## 主账号与子账号

同一张 `seller.operator` 表，靠 `is_primary` 区分，**不拆两张表**：登录、审计、归属判断都要对两者一视同仁，
拆开就得处处 `if`。

- **主账号**：全部权限 + 全部店铺（**含已关店**）。`uq_operator_primary` 部分唯一索引保证一个商家只有一个。
  范围含已关店是因为关店只是不再经营，历史订单与遗留模板还是他家的
- **子账号**：角色权限并集（只含 `risk_level = 'normal'` 的码）+ 显式授权的店。
  动钱点（`ORDER_REFUND_APPROVE` / `SETTLEMENT_APPROVE`）主账号专属，不进可授予清单——
  `Authorizer` 启动时扫 `seller.role_permission`，high 码出现在任何角色上都起不来

**店铺范围已经贯穿卖家侧的订单、包裹、售后三处入口**：列表把 `shop_id IN (shopIds)` 写进 SQL，
点查查完比对、越界折 404。商家归属（`merchant_id`）与店铺范围是两个维度，只绑前者是这一层最常见的漏法。

**子账号登录名带前缀**：`主账号登录名 + ":" + 后缀`（`boss:kefu01`）。`login_name` 仍是全局唯一单列，
登录 SQL 不需要为此改动——前缀解决的是唯一性收窄，否则第一个商家占了 `kefu01`，第二个商家的客服就永远叫不了。
配套规则是主账号登录名创建后不可改，否则已有子账号的前缀会悬空。

当前只开了主账号的登录路径。子账号的表结构已就位，接登录只是多一条分支。

## 运费模板

`shipping_template` 是**店铺配置**：一个店一套，`shop_id` 指向本模块的 `shop`，一个商家开两家店就是两套模板。

**表在这里，算钱不在这里。** `pricing` 通过 `ShippingTemplateQuery.activeFor(shopId)` 拿 `FreightRule`
值对象，结合折后金额算出这一单收多少——因为"满 99 包邮"的门槛要看折后金额，而折后金额只有算价知道。
和 `promotion` 的分工完全一样：数据归拥有者，计算归算价。

两条约束保证它能用：

- `uq_shipping_template_active`（partial unique）：一个店同时只能有一个 `active` 模板
- `ck_shipping_default_region`：`regions` 里必须有一条 `areaCodes: []` 的默认项，
  否则没单独配过的地区算不出运费

### 写入侧：三态与两条闸门

`/api/seller/shipping-templates`，六个端点：列表 / 详情 / 新建 / 编辑 / 启用 / 归档。

```
draft ──activate──▶ active ──archive──▶ archived
  │                   │                    （只读，终态）
  └─────archive───────┘
```

- **新建一律 `draft`**：启用是独立一次确认。没有草稿态的时候，新建出来就得是 active，
  而 active 一旦被报价单引用，改它就是改历史证据
- **启用会先归档同店的旧 active**，同一个事务里做完。顺序不能反：
  `uq_shipping_template_active` 是部分唯一索引，先启新的会撞键
- **`archived` 只读**，改它返回 `CONFIG_ARCHIVED`（409）。这条同时写在库的 `where` 里
  （`AND status <> 'archived'`），不靠内存里的 `if`——两个人同时编辑，先读后判会双双通过

形状校验在写入时做，不留给算价：**必须有且只有一条默认项**（0 条算不出运费，2 条取哪条没定义）、
**地区编码不能重复**（同一地区配两次，"取最具体的"会退化成"取先命中的"，而顺序不是契约）、
首件/续件不能为 0（会让续件除法除零）。前两条在 service，后一组在 `FreightRule.Region` 的构造器里——
读库和接请求走同一道闸。

## 闭环状态

- 登录 → 令牌 → 判权 → 数据范围：**闭环**（主账号）。停用账号即使拿着未过期令牌也会被当场拒
- **店铺范围已在卖家侧三处生效**（订单 / 包裹 / 售后），见上文
- **子账号没有登录路径**：表建了，人进不来
- **`GET /api/seller/me` 已落**（`SellerMeController`）：返回 operatorId / merchantId / 当前店铺 / 语言偏好。
  语言偏好另走 `PUT /api/seller/locale`，列可空、`null` = 没表过态（见 account/README「语言偏好」）
- **没有店铺管理接口**：`shop` 表只有种子和测试在写，开店/改名/关店都还没有
- **没有角色管理接口**：`role` / `role_permission` 同理，现在只能靠 SQL 造。
  接线时必须做两件事：勾选框只列 `risk_level = 'normal'` 的码；写 `role_permission` 前校验
  「授予集合 ⊆ 操作者自己的权限集」（否则持 `SELLER_STAFF_MANAGE` 的客服能给自己勾满权限）
- **没有删除**：模板只能归档，`draft` 也删不掉。归档后想恢复只能新建一套再启用
- **没有密码修改**：种子密码改了就得重建数据

这些不是遗漏，是「表先于接口」的有意顺序——权限模型的形状一旦错了，改接口比改表贵得多。
