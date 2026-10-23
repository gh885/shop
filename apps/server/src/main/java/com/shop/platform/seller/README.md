# seller — 商家与账号

```yaml
module: seller
layer: 支撑域
schema: seller
status: implemented
depends_on: []
emits: []
consumes: ["SellerSuspended", "CategoryGrantRevoked", "CredentialExpired"]
```

支撑域。schema：`seller`。权限模型见 [access-control.md](../../../../../../../../../docs/domain/access-control.md)。

## 模块契约

| 方向 | 对象             | 内容                                                                                          |
| ---- | ---------------- | --------------------------------------------------------------------------------------------- |
| 输入 | —                | 不依赖任何业务模块，也不消费事件。治理判定归 `trust`，将来真要在这里查资质再加 `trust :: api` |
| 输出 | `pricing :: api` | `activeFor(shopId)` → `FreightRule`：计费口径、包邮门槛、地区费率                             |
| 输出 | `infra` 的 SPI   | `SellerOperatorResolver`：把令牌里的卖家 id 解析成 `CurrentOperator` + 数据范围               |

**只给规则，不算钱。** 运费模板的金额由 pricing 算——包邮门槛要看折后金额，而折后金额只有算价知道。

**不做商家治理**：扣分、处置、申诉归 `trust`；平台内部员工归 `staff`，不并进来。

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
├── controller/  SellerLoginController：一个 handler 只调一个 service
├── service/     SellerLoginService：密码校验 + 签发令牌
├── dto/         SellerLoginRequest
├── mapper/      OperatorCredentialStore（登录用凭证）、LocalAccountSeed（本地种子）、
│                ShippingTemplateStore（运费模板，读 seller.shipping_template）
└── api/         SellerOperatorResolver（infra 的 OperatorResolver SPI）、
                 ShippingTemplateQuery + FreightRule（给 pricing 的运费规则值对象）
```

`api/` 配了 `@NamedInterface("api")`——它是这个模块对外的唯一入口。

## 主账号与子账号

同一张 `seller.operator` 表，靠 `is_primary` 区分，**不拆两张表**：登录、审计、归属判断都要对两者一视同仁，
拆开就得处处 `if`。

- **主账号**：全部权限 + 全部在营店铺。`uq_operator_primary` 部分唯一索引保证一个商家只有一个
- **子账号**：角色权限并集 + 显式授权的店

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

## 闭环状态

- 登录 → 令牌 → 判权 → 数据范围：**闭环**（主账号）。停用账号即使拿着未过期令牌也会被当场拒
- **子账号没有登录路径**：表建了，人进不来
- **没有店铺管理接口**：`shop` 表只有种子和测试在写，开店/改名/关店都还没有
- **没有角色管理接口**：`role` / `role_permission` 同理，现在只能靠 SQL 造
- **没有运费模板管理接口**：`shipping_template` 只能靠 SQL 造，商家改不了自己的运费
- **没有密码修改**：种子密码改了就得重建数据

这些不是遗漏，是「表先于接口」的有意顺序——权限模型的形状一旦错了，改接口比改表贵得多。
