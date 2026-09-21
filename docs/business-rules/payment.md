# 支付 / 资金

> 代码入口：apps/server/.../payment；order 支付联动；apps/web 收银台。规则以代码为准沉淀，改代码请同步本文件。

## 一、支付单模型与状态机

- **[PAY-01]** 支付流水（`payment.payments`）表示「一笔订单的一次支付尝试」，记录谁、何时、经哪个渠道、付了多少钱；同一笔订单可对应多条流水（每次尝试一行），但「当下有效的成功流水」至多一条。
- **[PAY-02]** 支付流水状态机为四态：`PENDING`（待支付/已发起未确认）→ `SUCCESS`（支付成功且已推进订单）→ `REFUNDED`（已退款，终态）；或 `PENDING → FAILED`（失败/关闭，接真实网关后启用）。合法转移只有这几条：发起落 `PENDING`，确认落 `SUCCESS`，退款落 `REFUNDED`，网关失败通知落 `FAILED`。
- **[PAY-03]** 状态可改（一律走条件转移），但金额、渠道、归属（`amount / currency / channel / order_id / user_id`）落库后不变；行携带 `paid_at`（成功时刻，PENDING 时为 NULL）、`refunded_at`（退款时刻，与 `REFUNDED` 同写）、`refund_gateway_no`（渠道侧退款单号）。
- **[PAY-04]** 支付入口在 payment 模块（`POST /payments`），V1 支付为「两段式」：发起（`pay`）建 PENDING 流水、不动订单状态；确认（`confirm`，模拟网关回调）才 `PENDING→SUCCESS` 并推进订单。发起方法只负责「下支付单」，结果推进交给确认端点（对应真实网关的回调）。
- **[PAY-05]** 「一单至多一条当下有效的成功流水」由部分唯一索引 `uk_payments_order_success`（`WHERE status='SUCCESS'`）在 DB 层硬保证。流水转为 `REFUNDED` 后该索引自动放开，但不构成重复支付风险——此时订单已 `CANCELLED`，`markPaid` 的条件转移会拒绝再次支付。

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

## 四、支付推进订单（markPaid）与金额构成

- **[PAY-14]** `markPaid` 只接受处于「待付款（`PENDING_PAYMENT`）」的订单，条件更新（`WHERE status IN (合法前态)` 即 `sourcesOf(PAID)`）影响行数不为 1 即抛 409「订单已取消或已支付，本次支付未生效」——这是并发下的唯一闸门。成功则转 `PAID`、回填 `paid_at` 与 `ship_expire_at`（付款时刻 + 发货窗口，见 PAY-30）。
- **[PAY-15]** 支付成功同事务产生三类资金/资源副作用：① 扣实本单冻结库存（`stockCommand.capture`）；② 核销本单占用的券（`couponCommand.useByOrder`，`LOCKED→USED`，自此不可逆，退款走「补发新券」而非把这张改回可用；本单没用券则无副作用）；③ 落一行审计流水（`PENDING_PAYMENT→PAID`，动作 `PAY`，发起方 BUYER）。冻结的才可支付，货真没了就归还冻结量。
- **[PAY-16]** 订单应付额构成固定：`pay_amount = item_amount + shipping_fee − discount_amount`（分）。该口径同时被 service 计费与 DB 约束 `ck_orders_pay_amount`（V57 起含优惠）钉死；另加 `ck_orders_discount_amount`：`0 ≤ discount_amount ≤ item_amount + shipping_fee`（优惠不得减穿为负）。
- **[PAY-17]** 计费口径：券门槛基数 = 同店商品额（不含运费、不含其他优惠）；包邮门槛按优惠前商品额判定（运费先算、券后减，用券不会反而丢掉包邮）；运费按「同店合计件数/商品额」报价，非按行。预览与下单走同一次计算（同源同口径），杜绝「预览一个价、下单另一个价」。`pay_amount` 落库与预览都吃同一次分组结果，不重算（重算会漂移）。
- **[PAY-18]** 下单时金额与币种成对落库：`currency` 取 `item_amount` 的币种（同一订单同币种）；`pay_amount` 及其组成列均 `CHECK >= 0`。行小计口径 `amount = price × quantity`（`ck_order_items_amount`），单行数量封顶 999（同 SKU 多行合并后封顶）。

## 五、金额校验与币种精度（Money）

- **[PAY-19]** 全链路金额唯一形状为 `Money{amount(分), currency}`：`amount` 以「分」为计量单位（整数，避免浮点误差），`currency` 为 ISO 4217 码。契约层（dto/api/controller/service/events/common）出现的金额字段类型必须是 Money，只有 mapper 实体按 `(金额列, currency 列)` 成对存并派生成 Money。
- **[PAY-20]** Money 不变式：`amount ≥ 0`（负金额构造即抛「金额不能为负」，语义为交易金额不为负）、`currency` 非空并 trim+大写规整。运算 `plus/minus/times/atLeast` 只在同币种间成立，跨币种抛 400「金额币种不一致，无法运算」；`minus` 结果不得为负（减穿抛错）；`times` 倍数不得为负。零金额用 `Money.zero(手上这笔钱的币种)`，不凭空造 CNY。
- **[PAY-21]** 币种闸门三层：入参 `requirePlatformCurrency()` 挡非 CNY 给 400（避免撞 DB CHECK 变 500）；DB 侧所有金额表列 `CHECK (currency='CNY')`（含 `payment.payments`、`orders.orders`、`orders.items`、`aftersale.tickets` 等）把「一期只有 CNY」钉成不变式；金额非负 DB CHECK 兜底。退款额必须与本单同币种，换币种的退款写不进订单投影列（`syncAfterSale` 的 WHERE 连币种一起挡）。

## 六、退款

- **[PAY-22]** 退款有两条触发通知，payment 一律「同步、同事务」监听（`@EventListener` 非 AFTER_COMMIT）：① `order::events` 的 `OrderCancelledEvent`（已付款单取消）；② `aftersale::events` 的 `AfterSaleRefundedEvent`（售后退款）。退款写不成就让上游一起回滚。未付款单取消不发 `OrderCancelledEvent`。
- **[PAY-23]** 消费 `OrderCancelledEvent`：查该订单 SUCCESS 流水，无流水则记 ERROR 日志、放行不阻塞取消（取消是买家既得权利，退款差对走人工对账）；有流水则先经网关 `refund` 提交、受理成功后把流水置 REFUNDED。渠道拒退时放行（不阻塞取消），且不再报「已退款」。
- **[PAY-24]** 消费 `AfterSaleRefundedEvent`：无 SUCCESS 流水直接抛异常回滚（售后是可协商流程，停回「申请中」由人工处理，比假报「已退款」诚实）；渠道拒退同样抛异常回滚。即售后退款「要么成、要么整体不成」，与取消场景的「放行兜底」取舍刻意不同。
- **[PAY-25]** 退款落本地单据：`refundByOrder` 是条件更新（`WHERE status='SUCCESS'` → 置 `REFUNDED`，回填 `refunded_at` 与 `refund_gateway_no`），按 orderId 定位，重复退款影响 0 行——该条件更新即幂等闸门。退款先提交渠道拿受理凭据，再把成功流水转 REFUNDED（退款单成为真资产，不只是改状态）。流水转移细则：退款不新建流水行，复用并原地转移原支付流水——退款凭据（退款时刻、渠道退款单号 `refund_gateway_no`）全部挂在原 SUCCESS 流水行上。
- **[PAY-26]** 退款金额：向渠道提交的退款额 = 该 SUCCESS 流水的全额（`Money.ofFen(success.amount, currency)`），即取消场景整单全额退。用券订单同口径：退的是整单实付（`pay_amount` 已减 `discount_amount`，券抵部分不含在渠道退款额里，由退券补发新券处理，见 PAY-27）。售后 V1 为「整单售后」（`ticket.order_item_id=NULL`），退款口径 = 申请时定格的整单实付（`refund_amount = order.pay_amount`，与币种一起快照落库）。DB 允许 `refund_amount ≥ 0`（预留部分退款字段位），但当前实现路径只有整单退。
- **[PAY-27]** 退款时的券处理：无论「已付款单取消」还是「售后退款」，都调 `couponCommand.returnOnRefund` 退券——原券保持 USED，另发新券回给买家（不把它改回可用）；没用券或券已过期则无副作用；退券与退款同事务（退款成而券没退，或反之，都是对不上账的半成品）。库存方向：仅退款路径同意即退、不回补库存；退货退款收货确认后退款并回补总库存（`stockCommand.restock`）；「已付款单取消」（未进入售后）也回补总库存。
- **[PAY-28]** 售后退款完成后把退款额写回订单投影列 `orders.refund_amount`（经 `order::api` 的 `syncAfterSale`，仅 REFUNDED 时传金额，其余传 null 不动），资金态本身仍唯一归 `payment.payments.status`——订单侧只记「退多少」，不重复定义资金状态。
- **[PAY-29]** 售后申请退款额在「申请瞬间」定格（读 `order.payAmount`），之后改价不影响该售后单；申请须满足「订单已完成 + 申请窗口未过 + 无进行中的单」，进行中的单唯一性由 `uk_tickets_open_per_order` 兜底。
- **[PAY-41]** 渠道实退金额一律取该单唯一成功支付流水的金额（见 PAY-26），`AfterSaleRefundedEvent` 携带的退款金额仅进日志留痕、不参与渠道计算也不落库——事件是通知不是资金指令，与流水金额不一致时以流水为准。

## 七、超时关单与已付款单自动退款

- **[PAY-30]** 三条超时线驱动订单推进，窗口长度唯一出处 `OrderTimeouts`：待付款窗口 = 下单起 15 分钟（到期自动关单、只释放冻结库存、未付款不发退款事件）；发货窗口 = 付款起 3 天（到期自动取消并回补总库存、落退款单据）；确认收货窗口 = 7 天（发货时按发货时刻铺底，签收时从签收时刻重算，到期自动确认收货、无库存/退款动作）。售后申请窗口 = 收货起 15 天。定时扫描每 30 秒一轮、单批上限 100 行。
- **[PAY-31]** 超时落点用条件更新 + 影响行数判定做并发让位，不加分布式锁：同一笔订单多实例只有一个抢到，余者返回 false 让位；买家入口抢不到转移报 409，系统入口让位。「付款后取消」（PAID→CANCELLED，含买家取消与发货超时）才发 `OrderCancelledEvent`，付款前取消（PENDING_PAYMENT→CANCELLED）只释放冻结与占用券（LOCKED→UNUSED，可再用）。

## 八、mock 与真实网关边界

- **[PAY-32]** `PaymentGateway` 是 payment 与技术渠道交互的唯一边界，V1 只抽象「现在真实存在的动作」= 退款（`refund`）。约定：`channel()` 返回值即 `payment.channel` 落库值；`refund` 是「提交」退款请求、返回渠道受理结果与渠道退款单号（受理 ≠ 完成）；渠道侧失败抛 `PaymentGatewayException` 由调用方按语义取舍。MOCK 实现受理即完成、无外部 IO，渠道单号取 `MOCK-REFUND-<paymentId>`。
- **[PAY-33]** 接真实网关时的演进（当前为设计意图，未实现）：发起改为「建 PENDING 流水 + 返回收银台跳转参数」；确认端点 `/payments/{id}/confirm`（现由前端一次点按串联）替换为网关通知回调；失败通知在 confirm 的兄弟方法走 `transition(id, FAILED)`；若退款结果异步（如微信退款回调），「本地流水置 REFUNDED」的时机应移到退款结果回调。换网关 = 换 `PaymentGateway` 实现并切换注入，模块内部与监听器逻辑不动。`kernel.event_publication` 登记表与 `EventPublicationRecoveryJob` 保留给将来的 AFTER_COMMIT 消费方（如接真实网关后的退款），当前无消费方在用。
- **[PAY-34]** 发起支付入参只报单不报价（`CreatePaymentRequest{@NotNull orderId}`），金额、归属由后端从订单投影取；确认端点无 body，仅带路径 `{id}`。这保证前端无法篡改金额。

## 九、前端支付流程（apps/web 收银台）

- **[PAY-35]** 收银台路由 `/pay/$orderId` 在 loader 中先读完订单详情再渲染（「收银台不能拿一份可能过期的金额去收钱」）：404 走 `notFound()`，其它错误进路由错误页；SSR 阶段跳过预取。展示的金额取自订单详情的 `payAmount`（后端按订单投影，前端不报价）。
- **[PAY-36]** 收银台状态机为 `ready → paying → success / confirm-error / create-error`，五种互斥展示态由 query/mutation 标志派生。一次「确认支付」点按用 mutation 链串起两段式：先 `createPayment`（建 PENDING 流水）成功后立刻 `confirmPayment`（模拟回调推进）。不再随组件挂载自动发起（服务端命令的触发源必须是显式用户动作，而非 mount effect）。
- **[PAY-37]** 错误态区分两段失败：发起失败（create-error）文案「发起支付失败」并提供「重试发起」；确认失败（confirm-error）文案「支付未生效」，提示订单状态可能已变更（已被支付/取消/关闭），只给「返回我的订单 / 查看订单详情」不就地重试确认。下单成功后跳转收银台，多单场景把其余 `orderIds` 带在 search 上（一次结算按店拆成 N 单）。
- **[PAY-38]** 取数副作用：`useCreatePayment` 不做缓存失效（返回的流水由收银台直接消费，此步不改任何已缓存查询），且不提示成功（避免与确认成功提示互相覆盖）；`useConfirmPayment` 成功提示「支付成功」并失效 my-orders / order-detail 两个订单缓存（订单状态推进发生在此步）。
- **[PAY-39]** 订单列表/详情仅对「待付款」单展示支付倒计时（读 `payExpireAt`），到点由后端超时关单，前端不提供独立支付入口之外的报价。列表 wire 只有净额 `payAmount`，详情才有 `itemAmount/shippingFee/discountAmount` 四件套——展示金额构成时以详情契约为准，保证「商品总价 + 运费 − 优惠 = 实付款」对得上。

## 十、订单状态机（支付相关部分）

- **[PAY-40]** 订单履约主状态机单路径：`PENDING_PAYMENT → PAID → SHIPPED → COMPLETED`，`PENDING_PAYMENT / PAID` 可转 `CANCELLED`；转移合法集是 `OrderStatus.TRANSITIONS` 唯一真相，条件更新反推合法前态。买家可见动作目标态含 `PAID`（付款）/`CANCELLED`（取消）/`COMPLETED`（收货），卖家含 `SHIPPED`。支付相关的推进就是 `PENDING_PAYMENT→PAID` 这一条边，仅由 `markPaid`（PAY-14）落。
