# 售后 / 退款

> 代码入口：apps/server/.../aftersale；payment 退款链路；apps/web/order/after-sale.ts、apps/seller 售后工作台。规则以代码为准沉淀，改代码请同步本文件。

## 准入与窗口

- **[AFS-01]** 买家发起售后申请须同时满足四项：订单主状态为 `COMPLETED`（确认收货或超时自动收货之后）、申请截止时刻 `apply_expire_at` 未过、该订单当前没有进行中的售后单（`APPLYING` / `RETURNING`）、最新一张售后单不是 `REFUNDED`（见 AFS-05）；前三项任一不成立拒绝申请（409「当前不可申请售后」），末项撞 409 + code `AFTER_SALE_ALREADY_REFUNDED`。
- **[AFS-02]** 售后申请窗口 = 订单完成时刻起 **15 天**（`OrderTimeouts.AFTER_SALE_APPLY = Duration.ofDays(15)`），在订单转 `COMPLETED` 时（买家确认收货或系统超时自动收货）由完成时刻 +15 天回填 `apply_expire_at`。
- **[AFS-03]** 同一订单同一时刻至多一张进行中的售后单，由部分唯一索引 `uk_tickets_open_per_order ... WHERE status IN ('APPLYING','RETURNING')` 在 DB 层兜底，并发重复申请只能有一张成功（另一单收 409「该订单已有进行中的售后」）。
- **[AFS-04]** 售后单被拒绝（`REJECTED`）或买家撤销（`CLOSED`)后，只要仍在 15 天窗口内允许重新申请——后端挡「进行中」与「最新单已退款」（AFS-05）两类，被拒/撤销不伤买家利益不挡；一单历史上有几张售后单不限（只要最新一张不是 REFUNDED）。
- **[AFS-05]** 最新一张售后单为 `REFUNDED` 时禁止再次申请：后端 `apply` 直接拒绝（409 + code `AFTER_SALE_ALREADY_REFUNDED`，「该订单已完成退款，不能再次申请售后」）——V1 整单售后，一笔订单的整单退款只允许发生一次；前端同步不给已退款订单露出申请入口。
- **[AFS-06]** 售后申请只能由订单归属买家本人发起，非本人访问一律 404「订单不存在」（不泄露单据存在性）。

## 类型与申请内容

- **[AFS-08]** 售后类型二选一，申请时由买家定、之后不可改：`REFUND_ONLY`（仅退款，货不退、无库存回补）与 `RETURN_REFUND`（退货退款，走回寄—收货流程）；DB 层 CHECK 约束同词表。
- **[AFS-09]** V1 只有整单售后：售后单的 `order_item_id` 预留为 NULL，不支持按行项/部分数量退。
- **[AFS-10]** 申请理由可选，最长 200 字符；类型非法值在**请求体反序列化**阶段就挡下（body 里的枚举写错 → 400「请求体格式错误」，GEN-19 第②条），进不到业务校验。
- **[AFS-11]** 买家查看/操作售后只有一个入口——「最近一张售后单」（含终态），没有「售后列表」；从未申请过时查询返回 404（语义为「没有」而非错误）。

## 金额与分摊

- **[AFS-12]** 退款口径在申请瞬间快照 = 订单实付总额 `pay_amount`（币种随单，V1 恒 CNY），之后成交列不变；退款额不是行项小计的累加而是整单实付。
- **[AFS-13]** 订单实付 = 商品总额 + 运费 − 券减免（DB CHECK 钉死 `pay_amount = item_amount + shipping_fee - discount_amount`），因此**运费随退款全额退回**，优惠已事前折进实付、退款不另补差价。
- **[AFS-16]** 退款额与订单必须同币种：写回订单投影时币种不符即更新失败（WHERE 带币种条件）。

## 状态机与时限

- **[AFS-17]** 售后单状态集：`APPLYING`（申请中/卖家待处理）、`RETURNING`（退货中）、`REFUNDED` / `REJECTED` / `CLOSED`（三个终态）；进行中 = APPLYING、RETURNING 两态。
- **[AFS-18]** 合法转移全集（每行含发起方）：APPLY→APPLYING（买家新建）；APPLYING→REFUNDED（卖家同意·仅退款，一步到位无「已同意待退款」悬挂态）；APPLYING→RETURNING（卖家同意·退货退款，暂不退款）；RETURNING→RETURNING（买家回寄填单，态不变只落物流）；RETURNING→REFUNDED（卖家确认收货，此时才退款）；APPLYING→REJECTED（卖家拒绝）；APPLYING→CLOSED（买家撤销）；另有三条 SYSTEM 出边：APPLYING→REFUNDED（超时自动同意·仅退款）、APPLYING→RETURNING（超时自动同意·退货退款）、RETURNING→CLOSED（超时自动关闭，见 AFS-23）。表外转移全部非法。回寄填单可重复提交（改运单号重交），态不变、覆盖售后单上的运单号投影，物流侧回寄包裹同步覆盖更新（见 AFS-41）。
- **[AFS-19]** `REFUNDED` 有两个来源且副作用不同（仅退款来源不回补库存、退货收货来源回补），由动作而非目标态决定，不可由状态反推。
- **[AFS-20]** 拒绝、撤销只在 `APPLYING` 可发生：卖家同意（转 RETURNING）后不能再拒绝；买家在退货开始后不能再撤销。
- **[AFS-21]** 每次转移用条件更新（`WHERE status = 动作前置态`）做并发闸门，抢不到行（影响行数 0）报 409 + 该动作专属文案（如「售后单状态已变更，当前不可同意」）。
- **[AFS-22]** 每个售后动作追加一行 append-only 时间线（actor=BUYER/SELLER/SYSTEM、action、note 记录理由/回寄单号等），作为协商留痕；超时自动动作以 actor=SYSTEM + AUTO_* 动作名落表，不冒充人为主张。时间线暂无对外读接口。
- **[AFS-23]** 售后超时由定时任务兜底（C11）。**编号演进**：本条原为「卖家审核没有任何时限/超时默认行为，售后单可无限期停留在进行中」的现状留白，已改写为实现规则。两条红线：
    - `APPLYING` 超过 **48 小时**（`AfterSaleTimeouts.SELLER_RESPONSE`）卖家未处理 → 系统自动同意：仅退款走 `AUTO_REFUND` 转 REFUNDED 并退款、退货退款走 `AUTO_AGREE_RETURN` 转 RETURNING（仍等收货才退款），副作用与卖家手动同意**同一落点**（`AfterSaleService#refund` / 条件更新转移），不存在第二套逻辑；
    - `RETURNING` 自进入该态起超过 **7 天**（`AfterSaleTimeouts.BUYER_RETURN`）买家仍未填回寄运单号 → 系统自动关闭（`AUTO_CLOSE` 转 CLOSED），转终态即联动释放「一单一进行中售后」名额并写回订单投影。买家一旦填了运单号即不再自动关闭（货已在途，后续是卖家的确认收货动作——该方向暂无超时，仍是留白）。
    - 执行机制与订单侧 `OrderTimeoutCloser` 同型：`AfterSaleTimeoutJob` 每 30 秒扫描、每批至多 100 笔、逐笔独立事务、无分布式锁——并发安全靠条件更新（`WHERE status = from`，自动关闭还叠加 `return_tracking_no IS NULL`）做闸门，卖家抢先处理或买家补填运单号后定时器空转。计时起点不依赖 `updated_at`（MyBatis-Plus 条件更新不触发自动填充，不可靠）：APPLYING 用 `created_at`（单据诞生即 APPLYING 且无从回流），RETURNING 用时间线中 AGREE_RETURN/AUTO_AGREE_RETURN 事件时刻（进入 RETURNING 唯一入口）。

## 买卖家动作与权限

- **[AFS-25]** 买家可做：申请（`POST /orders/{id}/after-sales`）、撤销（CANCEL，仅 APPLYING）、回寄填单（RETURN_GOODS，仅 RETURNING，可重复提交、覆盖旧运单，见 AFS-41）；售后卡按钮吃售后单上下发的 `availableActions`（C5b，见 AFS-40），「查看退货物流」是前端按「已填过运单号」自加的纯导航入口，不在契约动作集里。
- **[AFS-26]** 卖家可做：同意（按类型分派仅退款一步退 / 退货退款进 RETURNING）、拒绝（APPLYING）、确认收货（RETURNING，触发退款+回补）；操作端点挂在订单资源下，按订单 id 定位最近一张进行中售后单。
- **[AFS-27]** 卖家售后操作与工作台要求 `ORDER_FULFILL` 权限（与订单作业同权），店铺归属由 `X-Shop-Id` 上下文圈定，越店访问一律 404。
- **[AFS-28]** 卖家售后工作台：本店售后单分页、`created_at` 倒序、status 可选筛选（空=全部，非法值 400 而非静默忽略——该 400 来自 service 层 `valueOf` 自判（GEN-19 第③条），参数以字符串收，不是 Spring 类型转换兜底）；不做「进行中优先」排序，待办/历史靠页签分流，默认停在「待处理（APPLYING）」。行内动作吃工作台行上下发的 `availableActions`（AFS-40）：APPLYING→同意/拒绝，RETURNING→确认收货，终态→空集（前端给「已处理」说明而非留白），不再按状态硬推。
- **[AFS-29]** 卖家决策弹窗在确认前按订单 id 重新拉当前售后单（类型/理由/退款金额/退货运单号），且按类型明示后果：仅退款=「同意后立即退款，商品不寄回」；退货退款=「同意后买家寄回、确认收货后才退款并回补库存」；拒绝=「买家仍可在申请窗口内重新申请」；确认收货=「立即退款并回补库存，先核对包裹」。拉不到售后单不拦确认，降级为一句提示。
- **[AFS-30]** 拒绝/撤销原因在代码中无独立入参（拒绝仅状态转移，不接受理由文本）。
- **[AFS-40]** 售后动作集下发（C5b，与订单侧 ORD-19 同款收敛）：按钮组唯一真相 = 后端算好随契约走的 `availableActions`（`aftersale/model/TicketAvailableAction` = `TicketAction` 转移表出边 ∩ 当前视角），视角随端点而定——买家端点（apply/详情的 `TicketResponse`）给买家口径（CANCEL / RETURN_GOODS / REAPPLY），卖家端点（详情 `TicketResponse` 与工作台行 `SellerTicketItem`）给卖家口径（AGREE / REJECT / RECEIVE_RETURN）；输出按枚举声明序，保证同一数据两次请求同一份 JSON。REAPPLY 不是本单出边而是「再开一张新单」：资格 = 本单为终态且非 REFUNDED、且订单申请窗口未过（与 AFS-04/05 闸门同口径），售后单看不见订单，由 service 经 order :: api 点查后把谓词喂给推导。`AUTO_*` 超时动作（AFS-23）刻意不下发——那是定时器吃的词表，不是给人点的按钮。前端只保留文案、顺序与主次，不按状态复刻第二张按钮表。

## 逆向联动（资金 / 券 / 库存 / 订单投影）

- **[AFS-35]** 售后退款完成（转 `REFUNDED`）触发同事务资金逆向：payment 提交渠道网关退款并把该单成功流水条件转移为 `REFUNDED`；落不成整体回滚、售后单弹回原态——不会出现「售后显示已退款却查无退款流水」。退款单据生成与流水口径细则见 payment.md。
- **[AFS-37]** 退款完成同事务触发退券；退券具体口径（补发新券、有效期、名额处理）见 coupon.md。
- **[AFS-38]** 库存回补只发生在「退货退款 + 卖家确认收货」：按整单全部行项 `stock += n / 可用 += n`（流水类型 `RETURN`）；仅退款同意退款但**不回补**（货没回来）。每次售后转移只写回订单投影，订单主状态不因售后变化（保持 COMPLETED）。
- **[AFS-39]** 售后每步转移后写回订单投影列 `after_sale_status`（与售后单状态同词表，NONE=从未售后）；退款完成时另写回 `refund_amount`。订单列表/详情展示吃投影，单据真相在 aftersale.tickets。
- **[AFS-41]** 回寄运单号覆盖更新（C10）：RETURN_GOODS 重复提交不再往 logistics 追加包裹行——售后侧把 `ReturnShipmentCommand.record` 换成 `replace`，同事务删除本订单旧 RETURN 包裹**及其轨迹节点**后重建，一单同一时刻至多一张有效回寄包裹；售后单两列投影随新建结果写回，旧单号的迟到推送不再串挂到新包裹（logistics 侧细则与取舍见 LOG-72）。重交同一运单号不撞自己的唯一索引（先删后插在同一事务里）。删除重建而不是原地改号/作废标记：作废要动状态 CHECK 需要新迁移（本任务不开），原地改号会让旧轨迹挂错包裹、状态投影无法单调重算。
- **[AFS-42]** 回寄地址由后端下发、买家售后详情是唯一消费点：`TicketResponse.returnAddress`（string，nullable）在**任何状态下查询时实时解析**——经 `shop :: api` 的 `MerchantAddressReadQuery.resolveReturnTo(shopId)` 取该店默认退货地址（`default_return` 且未删且 ACTIVE），**不做申请时刻快照**（卖家换了地址，买家就该寄新的）；出参是一行串「收件人 电话 · 省市区详址」。null 的语义 = 卖家没配默认退货地址，前端显示「卖家未设置退货地址，请先联系客服」，**不挡运单号登记**（寄去哪儿是协商问题，登记本身是留痕）。解析只发生在买家详情端点：apply 响应、卖家详情与工作台列表一律不解析（`from` 两参重载传 null，免列表 N+1）。代价是 aftersale 新增一条 `shop :: api` 依赖登记（shop 只依赖 account::api，无环）。
