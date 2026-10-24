# account — 买家账号

> 通用域 · schema `account` · 认证与会话已收口，三方登录未接

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

买家账号、登录方式、会话（刷新/登出/设备）、自助注销、收货地址簿。

## 模块契约

| 方向 | 对象           | 内容                                                                                                |
| ---- | -------------- | --------------------------------------------------------------------------------------------------- |
| 输入 | —              | 不依赖任何业务模块，只用 `common` / `infra`                                                         |
| 输出 | `infra` 的 SPI | `BuyerOperatorResolver`：把令牌里的买家 id 解析成 `CurrentOperator`                                 |
| 输出 | `trade :: api` | `AddressReadQuery.byId`：按 id 点查地址投影（含归属与三段码派生），查无返回空；归属校验是消费方职责 |

**不发事件**。买家身份在入口处解析一次，之后的模块拿到的都是 `buyerId`，不需要回头问 account。
权限点也不在这里——那是 `staff` 的 `Permission`。

## 拥有什么

`buyer` `login_binding` `addresses`

表都建在 `account` schema 里，跨 schema 不 JOIN、不建外键。

## 登录方式与安全口径

| 接口                              | 说明                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /api/buyer/register`        | 密码注册；撞号返回 `PHONE_ALREADY_REGISTERED`（注册必须区分，用户要知道换号还是去登录）  |
| `POST /api/buyer/login`           | 密码登录；不区分「没这个号/密码错/没设密码」，同一句话同一状态码（防手机号枚举）         |
| `POST /api/buyer/login/sms`       | 短信验证码登录，没号自动建号；停用账号不可绕过；休眠闸门见下                             |
| `POST /api/buyer/sms-code`        | 发登录验证码：图形验证码 → IP/号码频控 → 日限 → OTP（廉价凭证先失败）                    |
| `POST /api/buyer/forgot-password` | 发找回验证码（同一道人机验证前置）；账号不存在也照常发，不暴露存在性                     |
| `POST /api/buyer/reset-password`  | 凭重置验证码设新密码；成功即全端下线                                                     |
| `POST /api/buyer/refresh`         | 刷新双 token（一次一换）；重放裁决超宽限期判盗用 → 全端吊销 → `410 REFRESH_TOKEN_REUSED` |
| `POST /api/buyer/password`        | 首次设密（无旧密码）/ 改密（需当前密码）；改密即全端下线                                 |

所有登录失败路径（凭证错、被限流）都对占位哈希跑满一次 BCrypt——按响应耗时探测账号存在是白费劲。
限流：密码登录 IP 10 次/分 + 账号 5 次/10 分，被限流的响应与凭证失败同话术同状态码。

## 会话形状

- **access 15 分钟**（JWT，`typ=buyer`），**refresh 7 天**（不透明 32 字节随机串，Redis 只存 HMAC 摘要）
- refresh 走 httpOnly cookie（path 收窄到 `/api/buyer/refresh`），响应体只带 access
- 轮换一次一换；同设备重登会原子换掉设备索引指向的旧码，不产孤儿会话——登出/改密/重放兜底才能真的吊销干净
- 设备列表/单设备登出：`GET|DELETE /api/buyer/devices`
- 禁用账号：身份解析按 `status` 拒（当请求即 401/403）；注销账号：按 `deleted_at` 拒，与「从未存在」同答案

## 休眠闸门（号码回收防接管）

号码被电信回收再放号后，新机主凭收到的验证码接管旧账号是真实攻击面。设有密码且
`dormant-login-days`（默认 90 天）内无登录/续期记录的账号：短信登录被拒（引导走密码通道），
短信找回同样静默跳过——「能收到验证码」不构成重置旧账号凭证的资格。没密码的账号没有可保护的东西，短信照常。

## 自助注销（个保法第 47 条）

两段式：`POST /api/buyer/deletion/code`（发码）→ `POST /api/buyer/deletion`（申请，冷静期
`deletion-cooling-off-days` 默认 14 天）→ 期满由 `AccountDeletionJob` 匿名化（`DELETE /api/buyer/deletion` 可撤销）。
被禁用账号不给自助注销——封号是平台在追的事，注销不该成为销毁追踪线索的出口。
匿名化后手机号换成 `dz` 前缀占位串：号码交还电信循环放号后的下一个人，登录族按号码查不到这行。

## 收货地址簿

`addresses` 是买家地址的唯一录入源，**订单不引用它**：下单按 `addressId` 点查展开成快照，
改地址、删地址都不影响历史订单。规则：

- 每人至多 20 条；首条自动默认，默认唯一由 `uk_addresses_default` 部分唯一索引兜底
- 「先清后设」两步换默认，并发写偏斜撞索引折 409
- 归属校验一律 404（防枚举）；手机号明文存明文回本人——快照要完整可发，脱敏只在展示层
- 区划码存国标 6 位（运费按区县匹配的键），省市区名称冗余展示；三段码（省 2 / 市 4 / 区 6）由它派生
- 硬删：没人引用地址簿，软删只会白养一列

## 目录

```
account/
├── controller/  BuyerAuthController（登录族/刷新/登出/me）、BuyerAccountController（密码/资料/设备/注销）
├── dto/         各请求体
├── internal/    CaptchaService、SmsChannel（SPI）+ Dev 通道 + 虚拟收件箱、AccountDeletionJob
├── service/     BuyerAuthService（凭证）、BuyerSessionService（会话）、SmsCodeService、
│                AccountDeletionService + Executor（注销）、AddressService（地址簿）
├── mapper/      BuyerMapper、AddressMapper、AddressEntity
└── api/         AccountQuery、BuyerAccountQuery、BuyerOperatorResolver、AddressReadQuery
```

`api/` 配了 `@NamedInterface("api")`——它是这个模块对外的唯一入口。

## 边界

账号主体自建，登录方式外采（现在只有 dev 短信通道，真实通道实现 `SmsChannel` 即接入）。
与卖家的 `operator`、平台的 `staff` 是三套独立身份，**不共用表**。三端各自的登录、令牌、注销全部分开，
共用的只有权限点清单这一份。

## 闭环断点

- **没有买家资料编辑的全集**：只能改昵称；头像依赖对象存储直传，未接
- **`login_binding` 表是空的**：微信 / 支付宝 / Apple 登录的位置留好了，一个渠道都没接
- **真实短信通道未接**：`SmsChannel` 只有 dev 实现，生产 profile 下启动会因缺 bean 而失败（刻意 fail-closed）
- **改密没有「最近登录确认」**：只验当前密码；被盗 15 分钟 access 可设密接管，属短令牌的通用取舍
