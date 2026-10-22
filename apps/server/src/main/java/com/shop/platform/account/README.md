# account — 买家账号

> 通用域 · schema `account` · 进行中

```yaml
module: account
layer: 通用域
schema: account
status: in-progress
depends_on: []
emits: []
consumes: []
```

## 职责

买家账号、登录方式、安全设置。

## 拥有什么

`buyer` `login_binding`

表都建在 `account` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

账号主体自建，登录方式外采。与卖家的 `operator`、平台的 `staff` 是三套独立身份，**不共用表**。

合成一张 `user` 表 + `user_type` 字段是这类项目最常见的错：最后每个查询里都在 `if (type == "seller")`。
三端各自的登录、令牌、注销全部分开，共用的只有权限点清单这一份。

## 目录

```
account/
├── controller/  BuyerAuthController：注册 / 登录 / 我是谁
├── dto/         BuyerRegisterRequest、BuyerLoginRequest
├── service/     BuyerAuthService：BCrypt 校验 + 签发令牌
├── mapper/      BuyerStore
└── api/         AccountQuery、BuyerAccountQuery、BuyerOperatorResolver
```

`api/` 配了 `@NamedInterface("api")`——它是这个模块对外的唯一入口。

## 买家的身份形状与卖家不同

买家**没有权限点，也没有店铺范围**，`CurrentOperator` 里两个集合都是空的。这不是没做完：

- 买家的边界是「这单是不是我的」，靠数据归属列 `buyer_id` 判，不靠权限点
- 给买家塞一套 `Permission` 会把卖家那套 RBAC 拖过来，然后每次判权都要多一个分支
- 空集合在 `Authorizer.check` 里意味着买家做不了任何卖家动作，这正是想要的

要判断"这是买家还是卖家"，用 `CurrentOperator.operatorType()`，**不要用权限是否为空去猜**。

## 令牌里带身份类型

三套身份域共用一把签名密钥，所以令牌必须有 `typ` 声明。没有它，一个买家的 subject
被拿去查 `seller.operator` 也不会报错——只要 id 撞上就成了一次越权。

`OperatorAuthenticationConverter` 按 `typ` 只走对应那一个 `OperatorResolver`，撞 id 也进不去。
不认识或缺失的 `typ` 一律拒，不留"查一下再说"的余地。

## 登录口径

| 接口                       | 失败口径                                             |
| -------------------------- | ---------------------------------------------------- |
| `POST /api/buyer/login`    | 不区分「没这个号」和「密码不对」，同一句话同一状态码 |
| `POST /api/buyer/register` | **必须区分**，撞号返回 `PHONE_ALREADY_REGISTERED`    |

登录接口是匿名的，区分两者等于送一个手机号枚举器；注册也必须区分，否则用户不知道自己该换号还是该去登录。
两个接口取舍不同，是刻意的。

## 闭环断点

- **只有手机号 + 密码**：真实电商走手机号 + 短信验证码，但那要 `notification` 先有短信通道
- **`login_binding` 表是空的**：微信 / 支付宝 / Apple 登录的位置留好了，一个渠道都没接
- **没有找回密码**：密码丢了只能重建账号
- **没有刷新令牌**：access 到期只能重新登录，窗口 2 小时
- **没有买家资料编辑**：昵称、头像、手机号都改不了

## 层与依赖

层：通用域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
