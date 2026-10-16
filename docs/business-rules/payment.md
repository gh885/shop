# 支付 / 资金

> 代码入口：apps/server/.../payment；order 支付联动；apps/web 收银台。规则以代码为准沉淀，改代码请同步本文件。

## 一、支付单模型与状态机

- **[PAY-01]** 支付流水（`payment.payments`）表示「一笔订单的一次支付尝试」，记录谁、何时、经哪个渠道、付了多少钱；同一笔订单可对应多条流水（每次尝试一行），但「当下有效的成功流水」至多一条。
- **[PAY-02]** 支付流水状态机为四态：`PENDING`（待支付/已发起未确认）→ `SUCCESS`（支付成功且已推进订单）→ `REFUNDED`（已退款，终态）；或 `PENDING → FAILED`（失败/关闭，接真实网关后启用）。合法转移只有这几条：发起落 `PENDING`，确认落 `SUCCESS`，退款落 `REFUNDED`，网关失败通知落 `FAILED`。
- **[PAY-03]** 状态可改（一律走条件转移），但金额、渠道、归属（`amount / currency / channel / order_id / user_id`）落库后不变；行携带 `paid_at`（成功时刻，PENDING 时为 NULL）、`refunded_at`（退款时刻，与 `REFUNDED` 同写）、`refund_gateway_no`（渠道侧退款单号）。
- **[PAY-04]** 支付入口在 payment 模块（`POST /payments`），V1 支付为「两段式」：发起（`pay`）建 PENDING 流水、不动订单状态；确认（`confirm`，模拟网关回调）才 `PENDING→SUCCESS` 并推进订单。发起方法只负责「下支付单」，结果推进交给确认端点（对应真实网关的回调）。
- **[PAY-05]** 「一单至多一条当下有效的成功流水」由部分唯一索引 `uk_payments_order_success`（`WHERE status='SUCCESS'`）在 DB 层硬保证。流水转为 `REFUNDED` 后该索引自动放开，但不构成重复支付风险——此时订单已终态（取消退款为 `CANCELLED`、售后退款为 `COMPLETED`），`markPaid` 只认 `PENDING_PAYMENT`，索引放开也再支付不进去。

## 二、发起支付（pay）

- **[PAY-06]** 发起支付的前置校验：订单必须存在、属于当前登录买家、且处于「待付款」态。金额一律以订单投影为准，不信前端传入的金额。买家不匹配按 404「订单不存在」处理（不泄露单据存在性）。
- **[PAY-07]** 发起幂等短路（串行）：已有成功流水（SUCCESS）直接返回该流水；否则已有待确认流水（PENDING）复用之（取该订单最早的一条 PENDING），不堆积。只有「未付过」才要求待付款态；非待付款（如已取消）且无任何既有流水时拒绝发起，报 409「订单不是待付款状态」。
- **[PAY-08]** 并发发起可各插一条 PENDING（第 PAY-07 条的短路只挡串行重试），这被判定为可接受：重复扣款由确认阶段的条件转移闸断——两条 PENDING 都去 confirm 时只有第一条能过 `markPaid` 的条件转移，第二条拿 409 连带整个事务回滚。多出的 PENDING 行是「账面噪音、不是资金风险」。一单一 PENDING 的强化手段（`WHERE status='PENDING'` 部分唯一索引 + `ON CONFLICT DO NOTHING`）明确留作将来，不用 `catch DuplicateKeyException` 回读（PG 撞唯一索引即中止整个事务）。
- **[PAY-09]** 发起落库的流水：渠道恒为 `MOCK`，状态 `PENDING`，`amount/currency` 取订单 `payAmount` 的 Money 两值，`paid_at` 留空待确认回填。发起接口返回 201。

## 三、确认支付 / 回调与幂等

- **[PAY-10]** 确认支付校验：流水存在且属于当前买家（否则 404「支付流水不存在」）；已是 SUCCESS 的重复确认直接返回，幂等。
- **[PAY-11]** 确认用条件转移 `PENDING→SUCCESS` 防重复确认：影响行数不为 1 时拒绝，报 409「支付流水状态已变更，请刷新订单」。转移成功后回填 `paid_at`。
- **[PAY-12]** 确认与推进订单在同一个事务里：confirm 事务内同步调用 `order::api` 的 `OrderCommand.markPaid` 推进订单状态机、扣实冻结库存。若订单已被取消/超时，`markPaid` 抛 409 → 本事务整体回滚（第 PAY-11 条的 SUCCESS 转移一并撤销），流水留在 PENDING——刻意如此，绝不出现「钱付了单没了却显示支付成功」。同一事务内改不成 FAILED（会被一起回滚），落 FAILED 要等真实网关带来的失败通知。总口径：payment 对 order 的影响（本条的确认推进、退款侧的流水写回）一律同步、同事务完成，没有最终一致的第二通道。
- **[PAY-13]** 「PENDING 占位、SUCCESS 才生效」的资金-订单一致性口径：资金状态两侧原子；网关侧真已收款但本地单已取消的场景，由对账 + 退款语义兜底（真实对账任务尚未实现，属接真实网关后的待建能力）。

## 四、支付推进订单（markPaid）

- **[PAY-14]** `markPaid` 只接受处于「待付款（`PENDING_PAYMENT`）」的订单，条件更新（`WHERE status IN (合法前态)` 即 `sourcesOf(PAID)`）影响行数不为 1 即抛 409「订单已取消或已支付，本次支付未生效」——这是并发下的唯一闸门。成功则转 `PAID`、回填 `paid_at` 与 `ship_expire_at`（付款时刻 + 发货窗口，见 ORD-27）。
- **[PAY-15]** 支付成功同事务产生三类资金/资源副作用：① 扣实本单冻结库存（`stockCommand.capture`）；② 核销本单占用的券（`couponCommand.useByOrder`，`LOCKED→USED`，自此不可逆，退款走「补发新券」而非把这张改回可用；本单没用券则无副作用）；③ 落一行审计流水（`PENDING_PAYMENT→PAID`，动作 `PAY`，发起方 BUYER）。冻结的才可支付，货真没了就归还冻结量。

## 五、退款

- **[PAY-22]** 退款有两条触发通知，payment 一律「同步、同事务」监听（`@EventListener` 非 AFTER_COMMIT）：① `order::events` 的 `OrderCancelledEvent`（已付款单取消）；② `aftersale::events` 的 `AfterSaleRefundedEvent`（售后退款）。两条的失败姿态刻意不同：取消路径放行不阻塞（PAY-23 现文），售后路径写不成连上游一起回滚（PAY-24）。未付款单取消不发 `OrderCancelledEvent`。
- **[PAY-23]** 消费 `OrderCancelledEvent`：查该订单 SUCCESS 流水——有则先经网关 `refund` 提交、受理成功后把流水原地置 REFUNDED（不新建行，见 PAY-25）并记 `payment.refunded`（带渠道退款单号，那是与网关对账的唯一凭据）；渠道拒退**放行不阻塞取消**（取消是买家既得权利，退款差口走人工对账），且不再报「已退款」。无 SUCCESS 流水同样放行——该分支在 MOCK 链路下不可达（`PaymentService` 确认与 `markPaid` 同事务，PAID 单必有 SUCCESS 流水），是为接真实网关预留的对账缺口，记 `payment.refund.failed` 事件（reason 区分无流水/拒退，见 GEN-50 目录）。
- **[PAY-24]** 消费 `AfterSaleRefundedEvent`：无 SUCCESS 流水直接抛异常回滚（售后是可协商流程，停回「申请中」由人工处理，比假报「已退款」诚实）；渠道拒退同样抛异常回滚。即售后退款「要么成、要么整体不成」，与取消场景的「放行兜底」取舍刻意不同。**成功侧两条路径共用一个出口**：同一次 `backendRefund` 落退款单并打同一条 `payment.refunded`，只有渠道 `reason` 文案不同（订单取消退款 / 售后退款）。
- **[PAY-25]** 退款落本地单据：`refundByOrder` 是条件更新（`WHERE status='SUCCESS'` → 置 `REFUNDED`，回填 `refunded_at` 与 `refund_gateway_no`），按 orderId 定位，重复退款影响 0 行——该条件更新即幂等闸门。退款先提交渠道拿受理凭据，再把成功流水转 REFUNDED（退款单成为真资产，不只是改状态）。流水转移细则：退款不新建流水行，复用并原地转移原支付流水——退款凭据（退款时刻、渠道退款单号 `refund_gateway_no`）全部挂在原 SUCCESS 流水行上。
- **[PAY-26]** 退款金额：向渠道提交的退款额 = 该 SUCCESS 流水的全额（`Money.ofFen(success.amount, currency)`），即取消场景整单全额退。用券订单同口径：退的是整单实付（`pay_amount` 已减 `discount_amount`，券抵部分不含在渠道退款额里，由退券补发新券处理，见 PAY-27）。售后 V1 为「整单售后」（`ticket.order_item_id=NULL`），退款口径 = 申请时定格的整单实付（`refund_amount = order.pay_amount`，与币种一起快照落库）。DB 允许 `refund_amount ≥ 0`（预留部分退款字段位），但当前实现路径只有整单退。
- **[PAY-27]** 退款时的券处理：无论「已付款单取消」还是「售后退款」，都调 `couponCommand.returnOnRefund` 退券——原券保持 USED，另发新券回给买家（不把它改回可用）；没用券或券已过期则无副作用；退券与退款同事务（退款成而券没退，或反之，都是对不上账的半成品）。库存方向：仅退款路径同意即退、不回补库存；退货退款收货确认后退款并回补总库存（`stockCommand.restock`，**流水类型记 RETURN**，RESTOCK 只属于后台补货，见 PRD-55）；「已付款单取消」（未进入售后）也回补总库存（同为 RETURN）。
- **[PAY-28]** 售后退款完成后把退款额写回订单投影列 `orders.refund_amount`（经 `order::api` 的 `syncAfterSale`，仅 REFUNDED 时传金额，其余传 null 不动），资金态本身仍唯一归 `payment.payments.status`——订单侧只记「退多少」，不重复定义资金状态。退款额必须与本单同币种：`syncAfterSale` 的 WHERE 连币种一起挡，换币种退款写不进投影列。
- **[PAY-41]** 渠道实退金额一律取该单唯一成功支付流水的金额（见 PAY-26），`AfterSaleRefundedEvent` 携带的退款金额仅进日志留痕、不参与渠道计算也不落库——事件是通知不是资金指令，与流水金额不一致时以流水为准。

## 六、mock 与真实网关边界

- **[PAY-32]** `PaymentGateway` 是 payment 与技术渠道交互的唯一边界，V1 只抽象「现在真实存在的动作」= 退款（`refund`）。约定：`channel()` 返回值即 `payment.channel` 落库值；`refund` 是「提交」退款请求、返回渠道受理结果与渠道退款单号（受理 ≠ 完成）；渠道侧失败抛 `PaymentGatewayException` 由调用方按语义取舍。MOCK 实现受理即完成、无外部 IO，渠道单号取 `MOCK-REFUND-<paymentId>`。
- **[PAY-33]** 接真实网关时的演进（当前为设计意图，未实现）：发起改为「建 PENDING 流水 + 返回收银台跳转参数」；确认端点 `/payments/{id}/confirm`（现由前端一次点按串联，PAY-36）**不是换个实现继续跑，而是下线**——网关回调来自渠道服务器，带不上买家 JWT，入口身份只能是「匿名路由 + 报文验签 + 按渠道凭据定位流水」（先例 `CarrierWebhookController`：匿名可达，验签不过按上下文闸门 403），能平移的只有状态机与事务口径（条件转移 + 同事务 `markPaid`）；失败通知在 confirm 的兄弟方法走 `transition(id, FAILED)`；若退款结果异步（如微信退款回调），「本地流水置 REFUNDED」的时机应移到退款结果回调。退款方向也不止换实现：监听时机要从同步同事务改成 AFTER_COMMIT + outbox（`kernel.event_publication` 登记表与 `EventPublicationRecoveryJob` 就是留给它的，当前无消费方在用）。落地前置两件：`payment.payments` 补渠道交易号列（V27 明写那批随网关落库，今天没有列就没有「按渠道凭据定位流水」）；匿名白名单只放比 `/payments` 更长的一段（如 `/payments/callbacks/...`）——`JwtProperties.skipPaths` 按前缀匹配，写 `/payments` 会连带买家那两条自助路由一起跳过认证过滤器，等于把「没付也确认」这条路留在原地。
- **[PAY-34]** 发起支付入参只报单不报价（`CreatePaymentRequest{@NotNull orderId}`），金额、归属由后端从订单投影取；确认端点无 body，仅带路径 `{id}`。这保证前端无法篡改金额。合并支付入参同理只报结算键（`CreateCheckoutPaymentRequest{@NotNull checkoutKey}`，见 PAY-42），订单与金额一律后端按 `checkout_key` 反查。

## 七、合并支付（一次结算 N 单，同 `checkout_key`）

- **[PAY-42]** 一次结算按店拆成 N 单（见 ORD 拆单口径），订单侧用 `orders.checkout_key` 归组。合并支付让这 N 单走「一次发起 + 一次确认」：发起入参只带 `checkoutKey`，后端 `OrderReadQuery.checkoutLines(userId, checkoutKey)` 反查出该买家名下这组订单（不信任前端传 orderId 列表），逐单落一行 PENDING 流水、每行都写同一个 `payment.checkout_key`（V78 加列 + 部分索引 `(user_id, checkout_key) WHERE NOT NULL`）。合并流水仍是「一单一行」，只是多了归组键——`uk_payments_order_success`（每单至多一条成功流水）等资金不变量一条不改。
- **[PAY-43]** 合并发起对每一单套与逐单发起相同的幂等短路（PAY-07）：已有 SUCCESS 复用之、已有 PENDING 复用最早一条、都没有才要求待付款并新插。某单非待付款且无既有流水 → 整批 `Validate.conflict` 报 409「订单不是待付款状态」（合并是买家一次性动作，不做部分成功）。`checkoutKey` 查不到任何单 → 404「订单不存在」（ ownership 404，不泄露存在性）。
- **[PAY-44]** 合并确认 `confirmBatch(userId, checkoutKey)` 在**同一个事务**里：`selectByCheckoutKey` 取本批流水，逐条套单条确认口径（已 SUCCESS 幂等跳过；非 PENDING 报 409；条件转移 `PENDING→SUCCESS` 影响行数≠1 报 409；同事务 `markPaid` 推进该单）。任一条 `markPaid` 抛 409（如该单已取消/超时）→ **整批回滚**，所有流水退回 PENDING、所有订单保持待付款。刻意全或无：绝不出现「N 单里付了 K 单、剩下的说不清」的半成品资金态。`checkoutKey` 查不到流水 → 404「支付流水不存在」。
- **[PAY-45]** 合并的对外形状 `CheckoutPaymentResponse{checkoutKey, totalAmount(Money), payments[PaymentView]}`：`totalAmount` = 本批各流水 `amount` 的 `Money::plus` 折叠（同币种，跨币种在 Money 层即挡），仅用于收银台展示合计，不参与任何资金计算——真实扣款仍逐单走各自流水。`PaymentBatchView.from(rows)` 是纯折叠视图，空批 `orElseThrow`。
- **[PAY-46]** 前端已接合并支付：结算下单成功跳 `/pay/$checkoutKey`（新路由，与旧 `/pay/$orderId` 并存）。收银台调 `useCreateCheckoutPayment(checkoutKey)` → `useConfirmCheckoutPayment(checkoutKey)` 两段链（PAY-36 的合并版），全程只报 `checkoutKey`、不报订单金额。后端合并端点与逐单端点并存，逐单 `/pay/$orderId` 保留给「我的订单」列表里对已存在订单的补付（`use-order-actions` 的 `pay` 动作仍走它）。`checkoutKey` 由结算页自持（`useState(() => crypto.randomUUID())` 上提到 `useSubmitOrder`，下单与收银台共用同一个值）。

## 八、前端支付流程（apps/web 收银台）

- **[PAY-36]** 收银台状态机为 `ready → paying → success / confirm-error / create-error`，五种互斥展示态由 query/mutation 标志派生。一次「确认支付」点按用 mutation 链串起两段式：先发起（建 PENDING 流水）成功后立刻确认（模拟回调推进）——逐单走 `createPayment→confirmPayment`，合并走 `createCheckoutPayment→confirmCheckoutPayment`。不再随组件挂载自动发起（服务端命令的触发源必须是显式用户动作，而非 mount effect）。
- **[PAY-37]** 错误态区分两段失败：发起失败（create-error）文案「发起支付失败」并提供「重试发起」；确认失败（confirm-error）文案「支付未生效」，提示订单状态可能已变更（已被支付/取消/关闭），只给「返回我的订单」不就地重试确认。下单成功后跳转收银台：合并收银台 `/pay/$checkoutKey` 把本批 N 个 `orderId` 带在 search 上（`?orders=…`），仅供逐条渲染子单号与合计金额——真实扣款只认 `checkoutKey`，search 里的订单号不是资金指令（PAY-42）；`orders` 为空（手打/丢参）则 `notFound()`。
- **[PAY-47]** 合并收银台的金额展示：用 search 里每个 `orderId` 经 `orderDetailOptions(id, 0)`（staleTime 0，收银台不拿过期金额收钱）取回 `OrderDetail`，合计 = `sumMoney(details.map(payAmount))`（同币种，跨币种在 Money 层即挡）；此合计仅供展示，落库与扣款金额一律后端按 `checkoutKey` 反查（PAY-42/45），前端合计与后端 `totalAmount` 是两条独立计算，以后端为准。取数用 `useSuspenseQueries`（返回结果数组，`.map(r => r.data)`）。
- **[PAY-38]** 取数副作用：`useCreatePayment` 不做缓存失效（返回的流水由收银台直接消费，此步不改任何已缓存查询），且不提示成功（避免与确认成功提示互相覆盖）；`useConfirmPayment` 成功提示「支付成功」并失效 my-orders / order-detail 两个订单缓存（订单状态推进发生在此步）。

- **支付后详情新鲜度**：订单详情 loader 复用未失效缓存，但必须尊重支付 mutation 的失效（`staleTime: Infinity`，不使用忽略失效的 `"static"`）；导航预取不得跳过该检查。
