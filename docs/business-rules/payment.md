# 支付 / 资金

> 代码入口：apps/server/.../payment；order 支付联动；apps/web 收银台。规则以代码为准沉淀，改代码请同步本文件。

## 一、支付单模型与状态机

- **[PAY-01]** 支付流水（`payment.payments`）表示「一笔订单的一次支付尝试」，记录谁、何时、经哪个渠道、付了多少钱；同一笔订单可对应多条流水（每次尝试一行），但「当下有效的成功流水」至多一条。
- **[PAY-02]** 支付流水状态机为四态：`PENDING`（待支付/已发起未确认）→ `SUCCESS`（支付成功且已推进订单）→ `REFUNDED`（已退款，终态）；或 `PENDING → FAILED`（失败/关闭，接真实网关后启用）。合法转移只有这几条：发起落 `PENDING`，确认落 `SUCCESS`，退款落 `REFUNDED`，网关失败通知落 `FAILED`。
- **[PAY-03]** 状态可改（一律走条件转移），但金额、渠道、归属（`amount / currency / channel / order_id / user_id`）落库后不变；行携带 `paid_at`（成功时刻，PENDING 时为 NULL）、`refunded_at`（退款时刻，与 `REFUNDED` 同写）、`refund_gateway_no`（渠道侧退款单号）。
- **[PAY-04]** 支付入口在 payment 模块（`POST /payments`），支付为「两段式」：发起（`pay`）建 PENDING 流水、不动订单状态，真实渠道同时返回收银台跳转地址（`PaymentResponse.payUrl`，MOCK 为 null）；确认（`confirm`）才 `PENDING→SUCCESS` 并推进订单。发起方法只负责「下支付单」，结果推进交给确认入口。
- **[PAY-05]** 「一单至多一条当下有效的成功流水」由部分唯一索引 `uk_payments_order_success`（`WHERE status='SUCCESS'`）在 DB 层硬保证。流水转为 `REFUNDED` 后该索引自动放开，但不构成重复支付风险——此时订单已终态（取消退款为 `CANCELLED`、售后退款为 `COMPLETED`），`markPaid` 只认 `PENDING_PAYMENT`，索引放开也再支付不进去。

## 二、发起支付（pay）

- **[PAY-06]** 发起支付的前置校验：订单必须存在、属于当前登录买家、且处于「待付款」态。金额一律以订单投影为准，不信前端传入的金额。买家不匹配按 404「订单不存在」处理（不泄露单据存在性）。
- **[PAY-07]** 发起幂等短路（串行）：已有成功流水（SUCCESS）直接返回该流水；否则已有待确认流水（PENDING）复用之（取该订单最早的一条 PENDING），不堆积。只有「未付过」才要求待付款态；非待付款（如已取消）且无任何既有流水时拒绝发起，报 409「订单不是待付款状态」。
- **[PAY-08]** 并发发起可各插一条 PENDING（第 PAY-07 条的短路只挡串行重试），这被判定为可接受：重复扣款由确认阶段的条件转移闸断——两条 PENDING 都去 confirm 时只有第一条能过 `markPaid` 的条件转移，第二条拿 409 连带整个事务回滚。多出的 PENDING 行是「账面噪音、不是资金风险」。一单一 PENDING 的强化手段（`WHERE status='PENDING'` 部分唯一索引 + `ON CONFLICT DO NOTHING`）明确留作将来，不用 `catch DuplicateKeyException` 回读（PG 撞唯一索引即中止整个事务）。
- **[PAY-09]** 发起落库的流水：渠道取当前默认渠道（`shop.payment.channel`，MOCK / ALIPAY），状态 `PENDING`，`amount/currency` 取订单 `payAmount` 的 Money 两值，`paid_at` 留空待确认回填。发起接口返回 201。

## 三、确认支付 / 回调与幂等

- **[PAY-10]** 确认支付校验：流水存在且属于当前买家（否则 404「支付流水不存在」）；已是 SUCCESS 的重复确认直接返回，幂等。
- **[PAY-11]** 确认用条件转移 `PENDING→SUCCESS` 防重复确认：影响行数不为 1 时拒绝，报 409「支付流水状态已变更，请刷新订单」。转移成功后回填 `paid_at` 与渠道交易号 `gateway_trade_no`（MOCK 无渠道凭据，留 null）。
- **[PAY-12]** 确认与推进订单在同一个事务里：confirm 事务内同步调用 `order::api` 的 `OrderCommand.markPaid` 推进订单状态机、扣实冻结库存。若订单已被取消/超时，`markPaid` 抛 409 → 本事务整体回滚（第 PAY-11 条的 SUCCESS 转移一并撤销），流水留在 PENDING——刻意如此，绝不出现「钱付了单没了却显示支付成功」。同一事务内改不成 FAILED（会被一起回滚），落 FAILED 要等真实网关带来的失败通知。总口径：payment 对 order 的影响（本条的确认推进、退款侧的流水写回）一律同步、同事务完成，没有最终一致的第二通道。
- **[PAY-13]** 「PENDING 占位、SUCCESS 才生效」的资金-订单一致性口径：资金状态两侧原子；网关侧真已收款但本地单已取消的场景，由对账 + 退款语义兜底（真实对账任务尚未实现，属接真实网关后的待建能力）。

## 四、支付推进订单（markPaid）

- **[PAY-14]** `markPaid` 只接受处于「待付款（`PENDING_PAYMENT`）」的订单，条件更新（`WHERE status IN (合法前态)` 即 `sourcesOf(PAID)`）影响行数不为 1 即抛 409「订单已取消或已支付，本次支付未生效」——这是并发下的唯一闸门。成功则转 `PAID`、回填 `paid_at` 与 `ship_expire_at`（付款时刻 + 发货窗口，见 ORD-27）。
- **[PAY-15]** 支付成功同事务产生三类资金/资源副作用：① 扣实本单冻结库存（`stockCommand.capture`）；② 核销本单占用的券（`couponCommand.useByOrder`，`LOCKED→USED`，自此不可逆，退款走「补发新券」而非把这张改回可用；本单没用券则无副作用）；③ 落一行审计流水（`PENDING_PAYMENT→PAID`，动作 `PAY`，发起方 BUYER）。冻结的才可支付，货真没了就归还冻结量。

## 五、退款

- **[PAY-22]** 退款由 **aftersale 驱动**：退款单确认成功时经 `payment :: api` 的 `PaymentRefundCommand` 提交渠道并累计流水已退额（同事务）。payment **不再监听任何退款事件**——已付款订单取消也由 aftersale 监听 `order :: events` 的 `OrderCancelledEvent` 后建退款单、再调用本命令（AFS-46）。方向反过来（payment → aftersale :: events）会让两个模块在命名接口层面成环，故退款单据的唯一写入口收在 aftersale。
- **[PAY-23]** `PaymentRefundCommand.refund(PaymentRefund{orderId, refundNo, amount, reason})`：按订单找到唯一 SUCCESS 流水 → 按**流水自己的渠道**提交退款 → 渠道受理后累计已退额。渠道拒退**不抛异常**，返回 `PaymentRefundAttempt(success=false, errorMessage)`，由退款单落一条失败执行记录并交给重试线（AFS-47）——拒退是可重试的事实，不是数据错误。真正无法继续的两种情形仍抛：查无成功流水（404）、金额超过该笔支付剩余可退额度（409）。
- **[PAY-24]** 累计已退额是条件更新：`WHERE status='SUCCESS' AND refunded_amount + 本次 ≤ amount`，退满才把流水转 `REFUNDED` 并回填 `refunded_at`/`refund_gateway_no`；部分退款留在 `SUCCESS`，「退了多少」由 `refunded_amount` 表达。一次支付分三次退不会被提前标成整笔已退。
- **[PAY-25]** 退款幂等键 = **退款单号**：渠道参数 `out_request_no` 直接取它（支付宝用同一个号重复提交会被识别为同一笔），重试不会退第二次。旧的 `refundByOrder`（整单一次性置 REFUNDED）已删除。
- **[PAY-26]** 渠道退款额 = 退款单的 `amount`（商品行 + 可能的一条运费行，或补偿单的行金额），由 aftersale 按行实付与已退算出（AFS-12/13）；payment 只校验「不超过该笔支付剩余可退额」，不重算业务金额。币种必须与流水一致，否则 400。
- **[PAY-27]** 退券与库存不再由 payment 做：整单退满时的退券（`couponCommand.returnOnRefund`，原券保持 USED、另发新券）与退货退款的库存回补都在 aftersale 的退款执行落点，与改账本同事务（AFS-37/38）。「已付款单取消」的库存回补在 order 的取消链（ORD-33），不退两次。
- **[PAY-28]** 订单侧的「退了多少」由 `OrderCommand.settleRefund` 写 `refunded_amount` / `compensated_amount`，展示角标写 `after_sale_badge`；payment 只维护自己流水上的 `refunded_amount` 与渠道凭据，两边同事务、各自记自己的账。
- **[PAY-41]** 渠道实退金额以退款单为准，不再取「该单支付全额」：一张支付可以对应多张退款单（行级、多次），流水 `refunded_amount` 是它们的累计，且受 `≤ amount` 的 CHECK 与条件更新双重约束。

## 六、mock 与真实网关边界

- **[PAY-32]** `PaymentGateway` 是 payment 与技术渠道交互的唯一边界，动作集：`createTrade`（建渠道交易，返回收银台跳转地址，MOCK 返回 null）、`queryTrade`（查交易真相）、`refund`（提交退款）与 `channel()`/`available()`。约定：`channel()` 返回值即 `payment.channel` 落库值；`refund` 是「提交」、受理 ≠ 完成；渠道侧失败抛 `PaymentGatewayException` 由调用方按语义取舍。MOCK 实现受理即完成、无外部 IO，渠道单号取 `MOCK-REFUND-<paymentId>`，`queryTrade` 恒未支付。
- **[PAY-48]** 渠道装配与启动闸门：`PaymentChannels` 按 `payment.channel` 选网关；配了 `shop.payment.channel=ALIPAY` 而支付宝未启用/密钥不全时**启动失败**，绝不静默回落 MOCK——那种降级等于「买家不付钱也能把单推成已付款」。默认 `MOCK`，本地零配置可跑。
- **[PAY-49]** 确认的闸门按流水的**自身渠道**分两种：MOCK 由调用方声明（V1 已知边界）；非 MOCK 必须 `queryTrade` 拿到 `TRADE_SUCCESS`/`TRADE_FINISHED` 才推进，未支付报 409「支付未完成，请先完成付款」。渠道响应必须用支付宝公钥验签，验签失败视为渠道故障、拒绝推进。
- **[PAY-50]** 整单支付在真实渠道上是「串行逐单」：每条流水各自一笔 `out_trade_no`（各有一个 `payUrl`），收银台只能跳一条，买家付完一张回跳确认后再点「去支付」付下一张；`confirmTrade` 逐条过渠道闸门，没付清之前整批 409。MOCK 没有跳转，收银台一次确认即付清。**已删除**旧的 `payBatch`/`confirmBatch` 与「真实渠道 400」的整批闸门：整单支付的闸门现在是「逐条查渠道」，而不是「只许 MOCK」。
- **[PAY-51]** 支付宝回跳页 `/pay/return`：回跳参数不可信（未签名、可手改），只取 `out_trade_no`（即流水主键）转交确认端点，**不读**渠道带来的 `trade_status`/`total_amount`；查询由显式按钮触发（遵守 PAY-36 的「服务端命令不挂载即发」），刷新页面不会重复打渠道。
- **[PAY-33]** 接真实网关的剩余演进（已落：`createTrade`/`queryTrade`、渠道交易号列 V80、按流水渠道路由；**未落**：匿名回调）：确认端点 `/payments/{id}/confirm` 保留但语义已变为「向渠道查询」——它不再是买家自证付款的入口。真正缺的是**异步通知**：渠道回调带不上买家 JWT，入口身份只能是「匿名路由 + 报文验签 + 按渠道凭据定位流水」（先例 `CarrierWebhookController`：匿名可达，验签不过按上下文闸门 403）。届时放匿名白名单的只能是比 `/payments` 更长的一段（如 `/payments/callbacks/...`）——`JwtProperties.skipPaths` 按前缀匹配，写 `/payments` 会连带买家那两条路由一起跳过认证过滤器。回调与查询共用 `markPaid` 同一状态机与事务口径，回调只是「更快知道」。退款方向仍未改：监听时机要从同步同事务改成 AFTER_COMMIT + outbox（`kernel.event_publication` 与 `EventPublicationRecoveryJob` 已备，当前无消费方）。
- **[PAY-34]** 发起支付入参只报单不报价（`CreatePaymentRequest{@NotNull tradeId}`），金额与归属由后端按主订单反查；单条确认端点无 body、只带路径 `{id}`，整单确认只带路径 `{tradeId}`。前端在任何情况下都改不了金额。

## 七、整单支付（一次结算 N 张子订单，同一张主订单）

- **[PAY-42]** 一次结算按店拆成 N 张子订单，**支付载体是主订单**（`orders.trades`，V82 起的模型）：发起入参只带 `tradeId`，后端 `TradeReadQuery.paymentViewById` 反查这次结算的全部子订单，逐单落一行 PENDING 流水、每行写同一个 `payment.trade_id`。流水仍是「一单一行」，只是多了归属列——`uk_payments_order_success`（每单至多一条成功流水）等资金不变量一条不改。付款前没有任何子订单会处于「已支付」：`paid_at` 由确认时逐单回填。
- **[PAY-43]** 整单发起对每张子订单套幂等短路（PAY-07）：已有 SUCCESS 复用、已有 PENDING 复用最早一条、都没有才要求待付款并新插。主订单已付清 → 幂等返回既有成功流水、不再建渠道交易；主订单非待付款且流水不全成功 → 409「订单不是待付款状态」。`tradeId` 查不到或不是本人 → 404（ownership 404，不泄露存在性）。
- **[PAY-44]** 整单确认 `confirmTrade(userId, tradeId)` 在**同一个事务**里：`selectByTrade` 取本批流水，逐条套单条确认口径（已 SUCCESS 幂等跳过；非 PENDING 报 409；条件转移 `PENDING→SUCCESS` 影响行数≠1 报 409；同事务 `markPaid` 推进该子订单），最后 `markPaidIfComplete` 只在全部子订单都付清时推进主订单。任一条 `markPaid` 抛 409（如该单已取消/超时）→ **整批回滚**，所有流水退回 PENDING、所有子订单保持待发货。刻意全或无：绝不出现「N 单里付了 K 单、剩下的说不清」的半成品资金态。**逐条仍过渠道闸门**（与单条确认同口径）：真实渠道的流水必须 `queryTrade` 查到成功态，否则整批 409「支付未完成」——整批确认不是绕过「钱到没到」的旁路。
- **[PAY-45]** 整单的对外形状 `CheckoutPaymentResponse{tradeId, tradeNo, totalAmount(Money), payments[PaymentView]}`：`totalAmount` 取主订单的 `payAmount`（落库值，不是前端折叠出来的），仅用于收银台与卡片展示；真实扣款仍逐单走各自流水。`payments[]` 每行带 `orderNo`，收银台据此列出拆单明细。
- **[PAY-46]** 前端收银台**按主订单**开：`/pay/$tradeId`（旧 `/pay/$checkoutKey`、`/pay/$orderId` 已删）。金额与拆单明细来自 `GET /orders/trades/{id}`（与列表卡片同一形状），付款走 `useCreatePayment(tradeId)` → `useConfirmTrade(tradeId)` 两段链（PAY-36 的整单版），全程只报 `tradeId`、不报金额。`checkoutKey` 退回它本来的职责：下单幂等键，只用于 `POST /orders/create`。
- **[PAY-47]** 真实渠道下的整单支付仍是已知缺口：`payTrade` 给每条流水各建一笔渠道交易（一笔 `out_trade_no` = 一条流水），收银台只会跳第一个 `payUrl`，于是多店结算在真实渠道上只能逐单付——买家被带回 `/pay/return` 确认一张后，重新点「去支付」会复用其余 PENDING 流水、再跳下一张，串行能走通，但没有「一次付清」的引导。MOCK 渠道没有跳转（`payUrl` 为 null），收银台直接确认，不受此限。

## 八、前端支付流程（apps/web 收银台）

- **[PAY-36]** 收银台状态机为 `ready → paying → success / confirm-error / create-error`，五种互斥展示态由 query/mutation 标志派生。一次「确认支付」点按用 mutation 链串起两段式：先发起（建 PENDING 流水）成功后立刻确认（模拟回调推进）——整单走 `createPayment→confirmTrade`。不再随组件挂载自动发起（服务端命令的触发源必须是显式用户动作，而非 mount effect）。
- **[PAY-37]** 错误态区分两段失败：发起失败（create-error）文案「发起支付失败」并提供「重试发起」；确认失败（confirm-error）文案「支付未生效」，提示订单状态可能已变更（已被支付/取消/关闭），只给「返回我的订单」不就地重试确认。下单成功后跳 `/pay/$tradeId`；4xx 以外（含 404）由 loader 转 `notFound()`，手打地址进不来。
- **[PAY-38]** 取数副作用：`useCreatePayment` 不做缓存失效（返回的流水由收银台直接消费，此步不改任何已缓存查询），且不提示成功（避免与确认成功提示互相覆盖）；`useConfirmTrade`/`useConfirmPayment` 成功提示「支付成功」并失效 my-trades / trade-detail / order-detail 三组订单缓存（订单状态推进发生在此步）。

- **支付后详情新鲜度**：订单详情 loader 复用未失效缓存，但必须尊重支付 mutation 的失效（`staleTime: Infinity`，不使用忽略失效的 `"static"`）；导航预取不得跳过该检查。
