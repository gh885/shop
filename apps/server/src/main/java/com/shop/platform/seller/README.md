# seller — 商家与账号

支撑域。schema：`seller`。权限模型见 [access-control.md](../../../../../docs/domain/access-control.md)。

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
├── mapper/      OperatorCredentialStore（登录用凭证）、LocalAccountSeed（本地种子）
└── api/         SellerOperatorResolver：实现 infra 的 OperatorResolver SPI
```

`api/` 配了 `@NamedInterface("api")`——它是这个模块对外的唯一入口。

## 主账号与子账号

同一张 `seller.operator` 表，靠 `is_primary` 区分，**不拆两张表**：登录、审计、归属判断都要对两者一视同仁，
拆开就得处处 `if`。

- **主账号**：全部权限 + 全部在营店铺。`uq_operator_primary` 部分唯一索引保证一个商家只有一个
- **子账号**：角色权限并集 + 显式授权的店

当前只开了主账号的登录路径。子账号的表结构已就位，接登录只是多一条分支。

## 闭环状态

- 登录 → 令牌 → 判权 → 数据范围：**闭环**（主账号）。停用账号即使拿着未过期令牌也会被当场拒
- **子账号没有登录路径**：表建了，人进不来
- **没有店铺管理接口**：`shop` 表只有种子和测试在写，开店/改名/关店都还没有
- **没有角色管理接口**：`role` / `role_permission` 同理，现在只能靠 SQL 造
- **没有密码修改**：种子密码改了就得重建数据

这些不是遗漏，是「表先于接口」的有意顺序——权限模型的形状一旦错了，改接口比改表贵得多。
