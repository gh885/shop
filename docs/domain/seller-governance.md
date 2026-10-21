# 商家治理

> 回答 [questions.md](../questions.md) 第 80–88 题。治理判定落在 `trust` 模块，入驻材料和账号归 `seller`，保证金归 `funding`，刷单识别归 `risk`。
> 模块 README 见 [trust](../../apps/server/src/main/java/com/shop/platform/trust/README.md)。

## 1. 一分钟稿

> 商家治理只回答一件事：这个商家现在能不能卖、能卖什么、出事之后还能不能继续卖。
>
> 四个判定分开存：**身份**（`seller`）、**资格**（`trust`）、**钱**（`funding`）、**风险**（`risk`）。四件事的写者不同，不能揉成一张 `merchant` 表。
>
> 所有处置都走"违规事实 → 扣分 → 处置动作"三段，**扣分只追加，处置可回滚**。误杀了能申诉，申诉期间在途订单和售后照走，只停新交易和未结算的钱。
>
> 清退不是删数据：先停新单，再等在途订单和售后窗口走完，最后才关户。

## 2. 模型与不变式

### 2.1 四块边界

| 块   | 模块      | 管什么                                   | 不管什么                     |
| ---- | --------- | ---------------------------------------- | ---------------------------- |
| 身份 | `seller`  | 入驻申请、主体材料、结算账户、子账号     | 不判定能不能卖               |
| 资格 | `trust`   | 商家状态、类目授权、资质、违规、费率模板 | 不碰钱、不碰订单             |
| 钱   | `funding` | 保证金账户、保证金流水、账期授信         | 不进交易账本                 |
| 风险 | `risk`    | 刷单、套现、黄牛、盗号的特征和决策       | 不做最终处罚，只产出风险结论 |

一句话：**`seller` 收材料，`trust` 发资格，`funding` 收保证金，`risk` 出证据。** 四个模块各写各的表，跨模块只走 `api/` 或 `events/`。

### 2.2 商家状态机

```
applied ──提交审核──→ reviewing ──通过──→ active
   │                     │                 │
   │                     ├──驳回──→ rejected
   │                     └──补件──→ reviewing
   │
   └──撤回──→ withdrawn

active ──违规/欠保证金/资质过期──→ suspended ──整改通过──→ active
active / suspended ──清退──→ closing ──义务走完──→ closed
```

- **`active` 只是"允许交易"的粗状态**，具体能不能卖某个类目，还要看 `category_grant`、`credential`、`brand_grant`。
- **`suspended` 停新交易，不停在途订单。** 已支付的订单继续发货、售后继续受理；否则买家成了处罚对象。
- **`closing` 是清退过渡态。** 新商品全部下架，新订单禁止；在途订单、未结算的钱、未终态售后继续跑。
- **`closed` 是终态。** 所有订单终态、所有售后终态、保证金结算完才能进。

### 2.3 资格判定只有一个出口

```java
boolean canSell(merchantId, categoryId, brandId) {
    return profile.status == ACTIVE
        && grant(merchantId, categoryId).status == ACTIVE
        && credential(merchantId, categoryId).valid()
        && (brandId == null || brandGrant(merchantId, brandId, categoryId).valid());
}
```

`catalog` 发布商品、`trade` 下单、`search` 召回都调 `trust :: api` 的同一个判定，**不许各自拼条件**。判定结果带 `reasonCode`，前端能显示"缺品牌授权"还是"资质过期"。`credential` 先查类目级，再回退 `category_id IS NULL` 的全店资质。

### 2.4 违规与处置

违规事实和处置动作分开：

- **`violation` 只追加。** 一条违规一行，带 `points`、`reason_code`、`source`、`evidence_ref`。
- **`enforcement_action` 记录处置。** 警告、限流、下架、冻结结算、暂停类目、关店，各是一条动作，带生效/失效时间。
- **扣分可以过期。** 默认 12 个月滚动窗口；过期不是删行，是查询时按 `occurred_at` 过滤。
- **处置可以回滚。** 申诉成功开一条反向的 `enforcement_action`，不 UPDATE 原动作。

默认阈值（可配，不写死在代码里）：

| 12 个月扣分 | 处置                        |
| ----------- | --------------------------- |
| 12          | 警告 + 站内信               |
| 24          | 限制参加活动 + 搜索降权     |
| 36          | 暂停部分类目 / 冻结新增结算 |
| 48          | 暂停全店新交易，进入整改    |
| 60          | 清退（`closing`）           |

**阈值是配置，不是代码分支。** 每次处置写 `enforcement_action`，保证"为什么被限流"查得到。

### 2.5 保证金

保证金是 `funding` 的负债，不是 `clearing` 的交易账本。

- 入驻时按类目/风险等级收一笔 `deposit`。
- 违规罚款、售后退款缺口、平台垫付追偿，都从保证金扣；每次扣款一条 `guarantee_txn`。
- **扣款不直接改余额**，走 `funding :: api` 的 `deduct` 命令，和 `clearing` 的分录分开记。
- 保证金低于阈值 → `funding` 发 `GuaranteeLow` → `trust` 限制新交易；补足后恢复。
- 扣完仍欠 → 进 `closing`，从后续结算继续扣，直到清完。

### 2.6 七条不变式

1. **商家状态只有 `trust` 能改。** `seller` 只写申请材料，`catalog` / `trade` 只读判定。
2. **没有 active profile + active category_grant + valid credential，不能发布、不能下单。**
3. **`violation` 只追加，`enforcement_action` 只追加。** 纠错靠反向动作，不改历史。
4. **`suspended` 只停新交易，不停在途订单和售后。**
5. **保证金扣款只走 `funding`，不进 `clearing` 的交易分录。**
6. **申诉期间不自动执行新的扣分/罚款；已执行的处置可以暂停。**
7. **清退必须等订单、售后、保证金三件事都终态。**

## 3. 表与状态机

### seller.onboarding_application

```sql
id              uuid PRIMARY KEY DEFAULT uuidv7(),
merchant_id     uuid NOT NULL,
subject_type    text NOT NULL,      -- company | individual
subject_name    text NOT NULL,
license_no      text,
settlement_bank text,
status          text NOT NULL,      -- draft | submitted | reviewing | approved | rejected | withdrawn
submitted_at    timestamptz,
reviewed_at     timestamptz,
reviewer_id     uuid,
reject_reason   text,
created_at      timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_onboarding_merchant UNIQUE (merchant_id),
CONSTRAINT ck_onboarding_status CHECK (status IN
    ('draft','submitted','reviewing','approved','rejected','withdrawn'))
```

材料原件进对象存储，表里只存 key；手机号、身份证号等 PII 在展示层脱敏。

### trust.seller_profile

```sql
merchant_id     uuid PRIMARY KEY,
status          text NOT NULL,      -- applied | reviewing | active | suspended | closing | closed | rejected
level           text NOT NULL DEFAULT 'L1',   -- L1..L4，粗粒度经营能力
risk_level      text NOT NULL DEFAULT 'normal', -- normal | watch | high
points_12m      integer NOT NULL DEFAULT 0,   -- 缓存，按 violation 重算
joined_at       timestamptz,
suspended_at    timestamptz,
closed_at       timestamptz,
updated_at      timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ck_profile_status CHECK (status IN
    ('applied','reviewing','active','suspended','closing','closed','rejected'))
```

`points_12m` 是缓存，真相在 `violation`；日终重算，不一致就告警。

### trust.category_grant

```sql
id           uuid PRIMARY KEY DEFAULT uuidv7(),
merchant_id  uuid NOT NULL,
category_id  uuid NOT NULL,
status       text NOT NULL,        -- active | suspended | revoked
source       text NOT NULL,        -- apply | platform | migration
granted_at   timestamptz NOT NULL DEFAULT now(),
expires_at   timestamptz,
revoked_at   timestamptz,
CONSTRAINT uq_grant UNIQUE (merchant_id, category_id),
CONSTRAINT ck_grant_status CHECK (status IN ('active','suspended','revoked'))
```

类目授权不是商家等级的同义词：等级决定"能申请什么"，授权决定"现在能卖什么"。

### trust.brand_grant

```sql
id           uuid PRIMARY KEY DEFAULT uuidv7(),
merchant_id  uuid NOT NULL,
brand_id     uuid NOT NULL,
category_id  uuid NOT NULL,        -- 品牌授权按类目给，不做全类目授权
status       text NOT NULL,        -- active | suspended | revoked
granted_at   timestamptz NOT NULL DEFAULT now(),
expires_at   timestamptz,
CONSTRAINT uq_brand_grant UNIQUE (merchant_id, brand_id, category_id),
CONSTRAINT ck_brand_grant_status CHECK (status IN ('active','suspended','revoked'))
```

品牌授权只存关系，不存品牌资料；品牌本身在 `catalog.brand`，`trust` 只把 `brand_id` 当 uuid 用。

### trust.credential

```sql
id             uuid PRIMARY KEY DEFAULT uuidv7(),
merchant_id    uuid NOT NULL,
category_id    uuid,               -- null = 全店资质
type           text NOT NULL,      -- business_license | food | 3c | brand_auth
file_key       text NOT NULL,
status         text NOT NULL,      -- pending | valid | expiring | expired | rejected
issued_at      timestamptz,
expires_at     timestamptz,
reviewed_by    uuid,
created_at     timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ck_credential_status CHECK (status IN
    ('pending','valid','expiring','expired','rejected'))
```

`expiring` 由定时任务在到期前 30 天标记并通知；`expired` 后 `trust` 自动把对应 `category_grant` 置 `suspended`，并调 `catalog` 下架相关 offer。

### trust.violation

```sql
id             uuid PRIMARY KEY DEFAULT uuidv7(),
merchant_id    uuid NOT NULL,
type           text NOT NULL,      -- fake_ship | counterfeit | delay | abuse | other
reason_code    text NOT NULL,
points         integer NOT NULL,
source         text NOT NULL,      -- fulfillment | returns | risk | manual | dispute
source_ref     uuid,
evidence_ref   text,
occurred_at    timestamptz NOT NULL,
created_by     uuid,
created_at     timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ck_violation_points CHECK (points <> 0)
```

挂 `common.reject_mutation()`，只追加。撤销违规不是删行，是再记一条 `points < 0` 的调整行，`reason_code = 'appeal_reversed'`。

### trust.enforcement_action

```sql
id             uuid PRIMARY KEY DEFAULT uuidv7(),
merchant_id    uuid NOT NULL,
action         text NOT NULL,      -- warn | search_down | activity_ban | category_suspend | store_suspend | closing
reason_code    text NOT NULL,
trigger_id     uuid,               -- violation id / appeal id / 被反向的原 action id
effective_at   timestamptz NOT NULL DEFAULT now(),
expires_at     timestamptz,
created_by     uuid,
created_at     timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ck_action CHECK (action IN
    ('warn','search_down','activity_ban','category_suspend','store_suspend','closing'))
```

反向动作另开一行，`trigger_id` 指向原动作；**不要回写原行的 `reversed_by`**，否则这张表就不是只追加了。

### trust.appeal

```sql
id             uuid PRIMARY KEY DEFAULT uuidv7(),
merchant_id    uuid NOT NULL,
action_id      uuid NOT NULL,
status         text NOT NULL,      -- submitted | reviewing | accepted | rejected | withdrawn
reason         text NOT NULL,
evidence_ref   text,
reviewer_id    uuid,
decided_at     timestamptz,
created_at     timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_appeal_action UNIQUE (action_id),
CONSTRAINT ck_appeal_status CHECK (status IN
    ('submitted','reviewing','accepted','rejected','withdrawn'))
```

一个处置只能申诉一次。申诉期间原处置**暂停执行**，但不自动撤销；裁决拒绝后恢复。

### funding.guarantee_account / guarantee_txn

```sql
guarantee_account:
    merchant_id uuid PRIMARY KEY,
    currency    char(3) NOT NULL DEFAULT 'CNY',
    balance     bigint NOT NULL DEFAULT 0,
    threshold   bigint NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT now()

guarantee_txn:
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    merchant_id    uuid NOT NULL,
    type           text NOT NULL,     -- deposit | deduct | refund | adjust
    amount         bigint NOT NULL,   -- 有符号
    ref_type       text,              -- violation | after_sale | manual
    ref_id         uuid,
    idempotency_key text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_guarantee_txn_idem UNIQUE (idempotency_key)
```

`guarantee_account.balance` 是缓存，真相在 `guarantee_txn`；扣款和流水同一个事务。

### risk.risk_event / decision_log

沿用 [module-map.md](module-map.md) 的核心表。`risk` 只产出 `decision`（pass / review / block）和特征，**不直接关店**；`trust` 消费 `RiskDecision` 后决定处置。

### 3.7 状态迁移的触发者

| 迁移                 | 唯一触发者                          |
| -------------------- | ----------------------------------- |
| 提交入驻、补件、撤回 | 商家（`seller`）                    |
| 审核通过/驳回        | 平台（`trust`）                     |
| 资质过期             | 系统（定时任务）                    |
| 扣分                 | 履约/售后/风控/平台，写 `violation` |
| 处置、解处置、清退   | 平台（`trust`）                     |
| 保证金扣款           | `funding`，由 `trust` 发起          |
| 申诉受理/裁决        | 平台（`trust`）                     |

## 4. 关键时序

### 入驻审核

```
商家提交申请（seller）
  → trust 校验主体、类目资质、品牌授权、保证金
  → 通过：profile.status=active，写 category_grant，发 MerchantApproved
  → 驳回：profile.status=rejected，带 reasonCode
```

审核材料归 `seller`，判定归 `trust`；`catalog` 只消费 `MerchantApproved` / `SellerSuspended`，不读申请材料。

### 资质过期

```
定时任务扫 credential.expires_at < now()+30d
  → 标 expiring，通知商家
  → 到期仍未续：status=expired，category_grant=suspended
  → 发 CredentialExpired
  → catalog 下架该类目 offer；trade 拒绝新单；在途订单不动
```

### 违规处置

```
fulfillment/returns/risk 报线索
  → trust 写 violation（points, source_ref）
  → 重算 points_12m
  → 命中阈值：写 enforcement_action，发 SellerSuspended / CategoryGrantRevoked
  → catalog 下架、search 降权、clearing 冻结新增结算
```

**在途订单不因为处置中断。** `suspended` 只影响新单和新上架；已支付订单继续履约，售后继续受理。

### 申诉

```
商家对 action 提 appeal
  → trust 暂停 action 的执行（不删除）
  → 人工复核
  → accepted：写反向 enforcement_action，恢复 grant/offer/结算
  → rejected：action 恢复，申诉记录留痕
```

**申诉不自动退款、不自动恢复已下架商品。** 恢复是新的动作，走同一条 `trust :: api`。

### 清退

```
trust 置 profile.status=closing
  → catalog 下架全部 offer，search 删索引
  → trade 拒绝新单；在途订单继续
  → returns 继续处理未终态售后
  → clearing 冻结结算，等售后窗口
  → 保证金抵扣欠款，剩余退还
  → 订单/售后/保证金全终态 → profile.status=closed
```

清退期间商家后台只读，不能再改商品或价格。

## 5. 失败模式与未决

### 会错在哪

| 现象                           | 根因                     | 怎么防                                           |
| ------------------------------ | ------------------------ | ------------------------------------------------ |
| 资质过期了商品还在卖           | 只标了 credential 没联动 | `CredentialExpired` → grant suspend + offer 下架 |
| 商家被暂停，已付款订单也不发货 | 处置粒度过粗             | `suspended` 只停新交易，在途订单照走             |
| 扣分改了历史                   | 直接 UPDATE violation    | 只追加；撤销记负分调整行                         |
| 申诉期间罚款照扣               | 申诉没暂停处置           | `appeal` 暂停 `enforcement_action`               |
| 保证金扣了但没流水             | 直接改 balance           | `guarantee_txn` + 同事务                         |
| 清退时还有未结算的钱           | 清退只看订单不看账       | `closing` 等售后窗口和结算终态                   |
| 误杀后商品恢复不了             | 下架动作不可逆           | 反向 `enforcement_action` 恢复                   |
| 刷单误判直接关店               | `risk` 直接执行处罚      | `risk` 只出 decision，`trust` 做处置             |

### 这一版不做

| 不做              | 为什么                                    | 什么时候回来看     |
| ----------------- | ----------------------------------------- | ------------------ |
| 商家分级权益体系  | 等级先只做准入门槛，权益等有商家运营再说  | 出现分层运营需求   |
| 自动判责/自动处罚 | 规则没稳定前自动化风险大                  | 违规量上来以后     |
| 商家贷/授信       | 属于 `funding` 的资金方债权，不进交易账本 | 有资金方合作时     |
| 大众评审          | 需要用户量和信用体系                      | 平台介入量上来以后 |
| 跨平台黑名单      | 涉及外部数据和合规                        | 有明确合规方案时   |

### 还没想清

- **扣分阈值按类目还是全店。** 现在全店一套；生鲜和 3C 的容错率不一样。
- **品牌授权的撤销粒度。** 撤一个品牌还是撤整个类目，要看授权关系怎么建模。
- **清退后数据保留多久。** 订单和售后要留，商品和聊天记录另说。
- **误杀补偿。** 停店期间的损失要不要补，补多少，没定。

---

## 实现契约

- **表**：`seller.onboarding_application`、`trust.seller_profile` / `category_grant` / `brand_grant` / `credential` / `violation` / `enforcement_action` / `appeal`、`funding.guarantee_account` / `guarantee_txn`
- **库约束**：`uq_onboarding_merchant`、`uq_grant (merchant_id, category_id)`、`uq_brand_grant`、`uq_appeal_action`、`uq_guarantee_txn_idem`；`violation` / `enforcement_action` 挂 `reject_mutation()`
- **判定出口**：`trust.canSell(merchantId, categoryId, brandId)`，`catalog` / `trade` / `search` 只调这一个
- **事件**：发 `MerchantApproved` / `SellerSuspended` / `CategoryGrantRevoked` / `CredentialExpired`；消费 `RiskDecision` / `GuaranteeLow`
- **错误码**：`MERCHANT_NOT_ACTIVE`、`CATEGORY_NOT_GRANTED`、`CREDENTIAL_EXPIRED`、`GUARANTEE_INSUFFICIENT`
- **验收**：资质过期后该类目新单必拒、在途订单不受影响；同一 action 只能申诉一次；清退必须等订单/售后/保证金全终态

## 范围外，但常被问

**「平台自营」** ——不做。自营的库存、价格、结算和 3P 完全不同，不是治理模块能扩出来的。

**「商家 ERP 对接」** ——不做。单账本下商家只需要在后台改数字，接 ERP 是开放平台的事。
