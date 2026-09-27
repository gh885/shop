# 售后 / 退款

> 代码入口：apps/server/.../aftersale；payment 退款链路；apps/web/order/after-sale.ts、apps/seller 售后工作台。规则以代码为准沉淀，改代码请同步本文件。

## 准入与窗口

- **[AFS-01]** 买家发起售后申请须同时满足四项：订单主状态为 `SHIPPED`（待收货）或 `COMPLETED`（确认收货 / 超时自动收货之后）、申请窗口未过（口径见 AFS-02）、该订单当前没有进行中的售后单（`APPLYING` / `RETURNING`）、最新一张售后单不是 `REFUNDED`（见 AFS-05）；前三项任一不成立拒绝申请（409「当前不可申请售后」），末项撞 409 + code `AFTER_SALE_ALREADY_REFUNDED`。谓词落在 `order::api` 的 `OrderAfterSaleView.afterSaleOpenAt`，消费方不自己比状态字面量。
- **[AFS-02]** 售后申请窗口分两段：**待收货期间随时可申**（`apply_expire_at` 此时还没回填，缺列即视为窗口开着）；订单转 `COMPLETED` 时由完成时刻 +**15 天**回填 `apply_expire_at`（`OrderTimeouts.AFTER_SALE_APPLY`），此后按该截止时刻判。前端 `canApplyAfterSale` 与后端同一口径（含「待收货缺列也算开着」）。
- **[AFS-03]** 同一订单同一时刻至多一张进行中的售后单，由部分唯一索引 `uk_tickets_open_per_order ... WHERE status IN ('APPLYING','RETURNING')` 在 DB 层兜底，并发重复申请只能有一张成功（另一单收 409「该订单已有进行中的售后」）。
- **[AFS-04]** 售后单被拒绝（`REJECTED`）或买家撤销（`CLOSED`)后，只要仍在申请窗口内（AFS-02）允许重新申请——后端挡「进行中」与「最新单已退款」（AFS-05）两类，被拒/撤销不伤买家利益不挡；一单历史上有几张售后单不限（只要最新一张不是 REFUNDED）。
- **[AFS-05]** 最新一张售后单为 `REFUNDED` 时禁止再次申请：后端 `apply` 直接拒绝（409 + code `AFTER_SALE_ALREADY_REFUNDED`，「该订单已完成退款，不能再次申请售后」）——V1 整单售后，一笔订单的整单退款只允许发生一次；前端同步不给已退款订单露出申请入口。
- **[AFS-06]** 售后申请只能由订单归属买家本人发起，非本人访问一律 404「订单不存在」（不泄露单据存在性）。
- **[AFS-43]** 待收货是买家唯一讲理的地方，售后出口开在这一段（拍板，补原「售后须等 COMPLETED」的流程断点）：包裹丢失、破损、拒收都要等 7 天自动确认收货再走售后，等于把「没收到」伪装成「已收货」。三条落地：① `afterSaleOpenAt` 认 `SHIPPED`（AFS-01/02）；② **不挡类型**——订单状态区分不了「包裹在路上」和「已签收没点确认」，退货退款在后者是正当诉求，谁该同意交给卖家判断（卖家可拒，走 AFS-23 时限）；③ **争议未决时自动确认收货让位**：`completeUnreceived` 见 `afterSaleStatus ∈ {APPLYING, RETURNING}` 直接返回 false，系统不替买家宣布收货；售后单自己有 AFS-23 的超时兜底，落到终态后同一轮扫描自愈（`receive_expire_at` 已过期仍匹配扫描条件，订单随即转完成并回填申请窗口）。买家手点确认收货不受此限——那是他自己的决定。待发货（PAID）仍不给售后入口：那一段买家的出口是取消退款（ORD-20），不必再开第二条退款通道。

## 类型与申请内容

- **[AFS-08]** 售后类型二选一，申请时由买家定、之后不可改：`REFUND_ONLY`（仅退款，货不退、无库存回补）与 `RETURN_REFUND`（退货退款，走回寄—收货流程）；DB 层 CHECK 约束同词表。
- **[AFS-09]** V1 只有整单售后：售后单的 `order_item_id` 预留为 NULL，不支持按行项/部分数量退。
- **[AFS-10]** 售后**原因必选**：`reasonCode` 取自枚举 `AfterSaleReason`（NO_REASON / QUALITY_ISSUE / NOT_AS_DESCRIBED / DAMAGED / WRONG_ITEM / MISSING_ITEM / OTHER），DB 层 CHECK `ck_tickets_reason_code` 同词表；买家另可给一段最长 200 字符的**补充说明**（`reason`，可选、只给人看，不参与任何判定）。**编号演进**：本条原为「申请理由可选，最长 200 字符」——纯自由文本判不出「这条诉求属于无理由」，而 AFS-45 的强制受理要的就是这个区分，故把原因升为枚举、文本降级为说明。历史单（改动前申请的）`reason_code` 恒为 NULL、不补编一个原因，出参按 required + nullable 下发，前端读不到就显示「未选择」。类型 / 原因非法值在**请求体反序列化**阶段就挡下（body 里的枚举写错 → 400「请求体格式错误」，GEN-19 第②条），进不到业务校验。
- **[AFS-11]** 买家查看/操作售后只有一个入口——「最近一张售后单」（含终态），没有「售后列表」；从未申请过时查询返回 404（语义为「没有」而非错误）。

## 金额与分摊

- **[AFS-12]** 退款口径在申请瞬间快照 = 订单实付总额 `pay_amount`（币种随单，V1 恒 CNY），之后成交列不变；退款额不是行项小计的累加而是整单实付。
- **[AFS-13]** 订单实付 = 商品总额 + 运费 − 券减免（DB CHECK 钉死 `pay_amount = item_amount + shipping_fee - discount_amount`），因此**运费随退款全额退回**，优惠已事前折进实付、退款不另补差价。
- **[AFS-16]** 退款额与订单必须同币种：写回订单投影时币种不符即更新失败（WHERE 带币种条件）。

## 状态机与时限

- **[AFS-17]** 售后单状态集：`APPLYING`（申请中/卖家待处理）、`RETURNING`（退货中）、`REFUNDED` / `REJECTED` / `CLOSED`（三个终态）；进行中 = APPLYING、RETURNING 两态。
- **[AFS-18]** 合法转移全集（每行含发起方）：APPLY→APPLYING（买家新建）；APPLYING→REFUNDED（卖家同意·仅退款，一步到位无「已同意待退款」悬挂态）；APPLYING→RETURNING（卖家同意·退货退款，暂不退款）；RETURNING→RETURNING（买家回寄填单，态不变只落物流）；RETURNING→REFUNDED（卖家确认收货，此时才退款）；APPLYING→REJECTED（卖家拒绝·申请阶段）；RETURNING→REJECTED（卖家拒绝·验货不通过，见 AFS-20）；APPLYING→CLOSED（买家撤销）；另有四条 SYSTEM 出边：APPLYING→REFUNDED（超时自动同意·仅退款）、APPLYING→RETURNING（超时自动同意·退货退款）、RETURNING→CLOSED（超时自动关闭）、RETURNING→REFUNDED（超时自动确认收货，两条 SYSTEM 兜底见 AFS-23）。表外转移全部非法。回寄填单可重复提交（改运单号重交），态不变、覆盖售后单上的运单号投影，物流侧回寄包裹同步覆盖更新（见 AFS-41）。
- **[AFS-19]** `REFUNDED` 有两个来源且副作用不同（仅退款来源不回补库存、退货收货来源回补），由动作而非目标态决定，不可由状态反推。
- **[AFS-20]** 撤销只在 `APPLYING` 可发生（买家在退货开始后不能再撤销）；**拒绝有两条边**：`APPLYING → REJECTED`（申请阶段驳回）与 `RETURNING → REJECTED`（REJECT_RETURN，货退回来了但验货不通过——同意退货不是不可撤销的支票，没有这条边，卖家面对调包件 / 少件 / 损毁只剩「不点确认收货拖着」这一招，而拖的代价全在买家身上：钱没退、货已寄走、订单因争议未决不自动完成）。拒绝**不退款、不回补库存**（钱和货都留在原处），买家的出口是申请窗口内重新申请（AFS-04）；两张按钮位共用一个 REJECT 动作（AFS-40），走哪条边由当前态决定。**例外只有一条**：`APPLYING` 阶段的拒绝对七天无理由强制单关闭（AFS-45）——消保法第 25 条禁止的是「拒绝受理」，而 RETURNING 那条边管的是「退回来的货验收不通过」，两件事不同，后者照旧留着。
- **[AFS-21]** 每次转移用条件更新（`WHERE status = 动作前置态`）做并发闸门，抢不到行（影响行数 0）报 409 + 该动作专属文案（如「售后单状态已变更，当前不可同意」）。
- **[AFS-22]** 每次转移用条件更新追加一行 append-only 时间线（actor=BUYER/SELLER/SYSTEM、action、note 记录理由/回寄单号等），作为协商留痕；超时自动动作以 actor=SYSTEM + AUTO_* 动作名落表，不冒充人为主张。时间线**没有对外读接口**（买家看不到完整协商轨迹），但有一个消费点：拒绝理由是它上面那行 note，由买家详情按需读出下发（AFS-44）——真相记在账本里，不在 tickets 复制一列。
- **[AFS-23]** 售后超时由定时任务兜底（C11）。**编号演进**：本条原为「卖家审核没有任何时限/超时默认行为，售后单可无限期停留在进行中」的现状留白，已改写为实现规则。两条红线：
    - `APPLYING` 超过 **48 小时**（`AfterSaleTimeouts.SELLER_RESPONSE`）卖家未处理 → 系统自动同意：仅退款走 `AUTO_REFUND` 转 REFUNDED 并退款、退货退款走 `AUTO_AGREE_RETURN` 转 RETURNING（仍等收货才退款），副作用与卖家手动同意**同一落点**（`AfterSaleService#refund` / 条件更新转移），不存在第二套逻辑；
    - `RETURNING` 自进入该态起超过 **7 天**（`AfterSaleTimeouts.BUYER_RETURN`）买家仍未填回寄运单号 → 系统自动关闭（`AUTO_CLOSE` 转 CLOSED），转终态即联动释放「一单一进行中售后」名额并写回订单投影。买家一旦填了运单号即不再自动关闭（货已在途，后续归第三条管）。
    - `RETURNING` 自**最后一次**回寄登记起超过 **10 天**（`AfterSaleTimeouts.SELLER_RECEIVE`）卖家未确认收货 → 系统自动退款并回补（`AUTO_RECEIVE` 转 REFUNDED，副作用与人工确认收货走 `AfterSaleService#receive` **同一落点**）。补的是原留白：买家已经把货寄回、卖家只要不点按钮就能把「已同意退货」悬成无限期，而 AFS-43 让订单在争议未决时不自动完成——没有这条超时，被拖的代价全在买家身上。10 天比正向确认收货（`OrderTimeouts.RECEIVE` 7 天）长，因为买家寄出后快递在途约 2～3 天，剩下才是卖家验货。
    - 两条 RETURNING 线靠 `return_tracking_no` 是否为空**严格互斥**（未寄回归自动关闭、已寄回归自动退款），同一张单不会被两套兜底各判一次。计时起点不取「存在一条过期事件」而取 `MAX(RETURN_GOODS 事件时刻)`：运单号可重复提交覆盖（AFS-41），改单号等于重新寄一次，钟该从最后一次起算，否则填错过单号的单会被老事件提前判死。
    - 执行机制与订单侧 `OrderTimeoutService` 同型：`AfterSaleTimeoutJob` 每 30 秒扫描、每批至多 100 笔（两侧同值，由 `SweepTest` 核对）、逐笔走 `common.Sweep.each` 隔离且各开独立事务、无分布式锁——并发安全靠条件更新（`WHERE status = from`，自动关闭还叠加 `return_tracking_no IS NULL`）做闸门，卖家抢先处理或买家补填运单号后定时器空转。计时起点不依赖 `updated_at`（MyBatis-Plus 条件更新不触发自动填充，不可靠）：APPLYING 用 `created_at`（单据诞生即 APPLYING 且无从回流），RETURNING 用时间线事件时刻——入态看 AGREE_RETURN/AUTO_AGREE_RETURN，买家寄回看最后一次 RETURN_GOODS。

- **[AFS-45]** 七天无理由强制（消保法第 25 条的实现，补 AFS-10 只能记录文本、判不出权利的那段）：**四条同时成立**才算「强制受理」——类型为 `RETURN_REFUND`、原因枚举为 `NO_REASON`、距「收到商品」未过 **7 天**（`AfterSaleTimeouts.NO_REASON`）、该订单**每个行项**下单时都支持无理由。成立即冻结进 `aftersale.tickets.no_reason_enforced`，卖家在 `APPLYING` 阶段只剩「同意」（AFS-20 的唯一例外）。五条实现口径：
    - **计时起点**取 `OrderAfterSaleView.receivedAt()`：签收时刻 `delivered_at` 优先（logistics 同步写回的投影），未签收而买家已确认收货则取 `completed_at`；两者都没有则**不成立**（宁可少强制，不可错强制——判错方向是把卖家的正当拒绝权没收掉）。这条与 `AfterSaleTimeouts` 另外三条同桌但性质不同：它是资格窗口，没有定时器去吃它。
    - **读下单快照不读商品现值**：判定吃 `orders.items.seven_day_return`（口径与来源见 ORD-61 / PRD-84）。两个理由：① 卖家事后把开关关掉不该抹掉买家买到时手上的权利，与 name/price/image 同一族快照原则；② aftersale 不依赖 `product :: api`（模块边界），这条权利本来就只能从订单行项读。行项为空（异常数据）同样不成立。
    - **申请那一刻定终身**：结论随 `apply` 写入 `no_reason_enforced`，之后不重算——卖家拖到第 8 天再处理，也不能把已经成立的强制反手变成可拒。
    - **两道门**：`TicketAvailableAction.sellerActions(status, noReasonEnforced)` 在 APPLYING 且强制时滤掉 REJECT（AFS-40 的下发口径），`AfterSaleService#reject` 同时硬校验同一条件（409「该申请为七天无理由退货，不可拒绝受理」，不另立错误码——HTTP 409 + 文案够用）。只收按钮等于信任前端。
    - **不管仅退款、也不碰超时**：第 25 条给的是「退货」的权利，不寄回的退款属协商而非法定，故 `REFUND_ONLY` 不受本条约束；`APPLYING` 那条 48 小时自动同意（AFS-23）本就是强制的更硬形式，两者同向不冲突。RETURNING 阶段的验货拒绝（REJECT_RETURN）照旧可用——强制管的是「受理」，不是「买家寄回来什么都得退」。

## 买卖家动作与权限

- **[AFS-25]** 买家可做：申请（`POST /orders/{id}/after-sales`）、撤销（CANCEL，仅 APPLYING）、回寄填单（RETURN_GOODS，仅 RETURNING，可重复提交、覆盖旧运单，见 AFS-41）；售后卡按钮吃售后单上下发的 `availableActions`（C5b，见 AFS-40），「查看退货物流」是前端按「已填过运单号」自加的纯导航入口，不在契约动作集里。
- **[AFS-26]** 卖家可做：同意（按类型分派仅退款一步退 / 退货退款进 RETURNING）、拒绝（APPLYING 与 RETURNING 两条边，理由必填，见 AFS-20/30；七天无理由强制单在 APPLYING 阶段没有这条，见 AFS-45）、确认收货（RETURNING，触发退款+回补；超时不做则系统代做，见 AFS-23）；操作端点挂在订单资源下，按订单 id 定位最近一张进行中售后单。
- **[AFS-27]** 卖家售后操作与工作台要求 `ORDER_FULFILL` 权限（与订单作业同权），店铺归属由 `X-Shop-Id` 上下文圈定，越店访问一律 404。
- **[AFS-28]** 卖家售后工作台：本店售后单分页、`created_at` 倒序、status 可选筛选（空=全部，非法值 400 而非静默忽略——该 400 来自 service 层 `valueOf` 自判（GEN-19 第③条），参数以字符串收，不是 Spring 类型转换兜底）；不做「进行中优先」排序，待办/历史靠页签分流，默认停在「待处理（APPLYING）」。行内动作吃工作台行上下发的 `availableActions`（AFS-40）：APPLYING→同意/拒绝，RETURNING→确认收货，终态→空集（前端给「已处理」说明而非留白），不再按状态硬推。
- **[AFS-29]** 卖家决策弹窗在确认前按订单 id 重新拉当前售后单（类型 / 原因与补充说明 / 退款金额 / 退货运单号），且按类型与当前态明示后果：仅退款=「同意后立即退款，商品不寄回」；退货退款=「同意后买家寄回、确认收货后才退款并回补库存」；拒绝=申请阶段「买家仍可在申请窗口内重新申请」、退货阶段「退款不会打出、库存不回补」；确认收货=「立即退款并回补库存，先核对包裹」。退货物流行按**状态**给（RETURNING 就摆出运单号），不按动作给——确认收货要核对单号，拒绝寄回件同样得先看清寄的是哪一单。拉不到售后单不拦确认，降级为一句提示。**原因行旁边挂一枚「七天无理由，不可拒绝受理」徽章**（`reasonCode=NO_REASON` + `noReasonEnforced` + 状态 APPLYING 三者同时成立才给）：那一行的「拒绝」按钮本就不在下发的动作集里（AFS-45），少个按钮必须说清为什么，否则卖家只会以为是界面坏了。
- **[AFS-30]** 拒绝理由**必填**：`PUT /seller/orders/{id}/after-sales/reject` 收 `{ reason }`（`@NotBlank @Size(max = 200)`），空着点「确认拒绝」在前端 zod 就被拦（提示「请填写拒绝理由」），不发请求。落点是拒绝动作那一行 `ticket_events.note`（200 与列同宽，不开第二份真相、不为它加迁移），买家侧读取口径见 AFS-44。理由不再是可选：拒绝是把买家推到「重新申请或认了」的终局决定，看不到理由的买家不知道该改什么，日后判责任也无线索。**买家撤销**（CLOSE）仍无入参——那是自己的决定，不需要向谁交代。
- **[AFS-40]** 售后动作集下发（C5b，与订单侧 ORD-19 同款收敛）：按钮组唯一真相 = 后端算好随契约走的 `availableActions`（`aftersale/model/TicketAvailableAction` = `TicketAction` 转移表出边 ∩ 当前视角），视角随端点而定——买家端点（apply/详情的 `TicketResponse`）给买家口径（CANCEL / RETURN_GOODS / REAPPLY），卖家端点（详情 `TicketResponse` 与工作台行 `SellerTicketItem`）给卖家口径（AGREE / RECEIVE_RETURN / REJECT，**正常推进的在前、破坏性的在后**：RETURNING 一态同时给确认收货与拒绝时，默认该走的是前者）；REJECT 是一个按钮背两条边的多对一映射（申请阶段落 REJECT、退货阶段落 REJECT_RETURN，与 AGREE 按类型落 REFUND/AGREE_RETURN 同款）；输出按枚举声明序，保证同一数据两次请求同一份 JSON。REAPPLY 不是本单出边而是「再开一张新单」：资格 = 本单为终态且非 REFUNDED、且订单申请窗口未过（与 AFS-04/05 闸门同口径），售后单看不见订单，由 service 经 order :: api 点查后把谓词喂给推导。`AUTO_*` 超时动作（AFS-23）刻意不下发——那是定时器吃的词表，不是给人点的按钮。卖家订单列表的行内售后按钮同样吃这份下发：`GET /seller/after-sales/actions?orderIds=…` 按本页订单批查（`SellerOrderTicketActions`，只回有进行中单的订单），而不是让订单列表行上的 `afterSaleStatus` 投影另推一张表——动作由售后状态机算出，而依赖方向是 aftersale → order :: api，把字段并进订单行会成环（见 ORD-51）。**卖家口径的推导多一个入参**：`sellerActions(status, noReasonEnforced)` 在强制单的 `APPLYING` 阶段滤掉 REJECT（AFS-45），且 `noReasonEnforced` 随 `TicketResponse` / `SellerTicketItem` 一起下发——按钮不见了要能在同一份数据里解释为什么，前端不许自己判「这单该不该给拒绝」。前端只保留文案、顺序与主次，不按状态复刻第二张按钮表。
- **[AFS-44]** 拒绝理由随**买家售后详情**下发：`TicketResponse.rejectReason`（nullable string），只在 `GET /orders/{id}/after-sales` 回填、且只在售后单为 `REJECTED` 时去读——读的是拒绝那条动作在 `ticket_events.note` 上留下的那行（`TicketEventMapper#selectLatestRejectNote`，一张单至多拒一次，REJECTED 是终态）。口径与 `returnAddress` 同一族：都是「买家详情独有的查询时解析项」，折成 `BuyerTicketDetail` 一个服务端形状传进 `TicketResponse.from`，而不是给工厂加两个位置相邻、都可空、语义不同的 String 参数（那样传反了编译期发现不了）。**不在 tickets 上复制一份拒绝理由**：同一件事存两处必然漂移，也不值一场迁移。卖家详情与工作台列表一律不回填（卖家自己写的原因不必再还给他），恒为 null。买家侧的落点是售后卡「补充说明」下面多出的「拒绝理由」一行（原因枚举与强制标记也各占一行，见 AFS-10/45）——它不是完整协商轨迹（AFS-22 的时间线仍不开读接口），只回答「为什么被拒」这一件事。

## 逆向联动（资金 / 券 / 库存 / 订单投影）

- **[AFS-35]** 售后退款完成（转 `REFUNDED`）触发同事务资金逆向：payment 提交渠道网关退款并把该单成功流水条件转移为 `REFUNDED`；落不成整体回滚、售后单弹回原态——不会出现「售后显示已退款却查无退款流水」。退款单据生成与流水口径细则见 payment.md。
- **[AFS-37]** 退款完成同事务触发退券；退券具体口径（补发新券、有效期、名额处理）见 coupon.md。
- **[AFS-38]** 库存回补只发生在「退货退款 + 确认收货」：按整单全部行项 `stock += n / 可用 += n`（流水类型 `RETURN`），卖家的 RECEIVE_RETURN 与超时的 AUTO_RECEIVE 走**同一个落点**（`AfterSaleService#receive`），不存在「自动那一路少回补一次」的第二套逻辑；仅退款同意退款但**不回补**（货没回来）。退货阶段被卖家拒绝（REJECT_RETURN）**不回补也不退款**——货虽在卖家手里，但没通过验收，回补等于替卖家把这件货重新上架。每次售后转移只写回订单投影，订单主状态不因售后变化（保持 COMPLETED）。
- **[AFS-39]** 售后每步转移后写回订单投影列 `after_sale_status`（与售后单状态同词表，NONE=从未售后）；退款完成时另写回 `refund_amount`。订单列表/详情展示吃投影，单据真相在 aftersale.tickets。
- **[AFS-41]** 回寄运单号覆盖更新（C10）：RETURN_GOODS 重复提交不再往 logistics 追加包裹行——售后侧把 `ReturnShipmentCommand.record` 换成 `replace`，同事务删除本订单旧 RETURN 包裹**及其轨迹节点**后重建，一单同一时刻至多一张有效回寄包裹；售后单两列投影随新建结果写回，旧单号的迟到推送不再串挂到新包裹（logistics 侧细则与取舍见 LOG-72）。重交同一运单号不撞自己的唯一索引（先删后插在同一事务里）。删除重建而不是原地改号/作废标记：作废要动状态 CHECK 需要新迁移（本任务不开），原地改号会让旧轨迹挂错包裹、状态投影无法单调重算。
- **[AFS-42]** 回寄地址由后端下发、买家售后详情是唯一消费点：`TicketResponse.returnAddress`（string，nullable）在**任何状态下查询时实时解析**——经 `shop :: api` 的 `MerchantAddressReadQuery.resolveReturnTo(shopId)` 取该店默认退货地址（`default_return` 且未删且 ACTIVE），**不做申请时刻快照**（卖家换了地址，买家就该寄新的）；出参是一行串「收件人 电话 · 省市区详址」。null 的语义 = 卖家没配默认退货地址，前端显示「卖家未设置退货地址，请先联系客服」，**不挡运单号登记**（寄去哪儿是协商问题，登记本身是留痕）。解析只发生在买家详情端点：apply 响应、卖家详情与工作台列表一律不解析（`from` 两参重载传 null，免列表 N+1）。代价是 aftersale 新增一条 `shop :: api` 依赖登记（shop 只依赖 account::api，无环）。
