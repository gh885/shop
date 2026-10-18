package com.shop.platform.aftersale.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.aftersale.dto.RefundLineRequest;
import com.shop.platform.aftersale.mapper.Refund;
import com.shop.platform.aftersale.mapper.RefundLine;
import com.shop.platform.aftersale.mapper.RefundLineMapper;
import com.shop.platform.aftersale.mapper.RefundMapper;
import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.AfterSaleTimeouts;
import com.shop.platform.aftersale.model.RefundAvailableAction;
import com.shop.platform.aftersale.model.RefundLineType;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.logistics.api.ReturnShipmentCommand;
import com.shop.platform.logistics.api.ReturnShipmentView;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderRefundLineView;
import com.shop.platform.order.api.OrderRefundView;
import com.shop.platform.order.api.OrderSummaryView;
import com.shop.platform.shop.api.AddressSnapshot;
import com.shop.platform.shop.api.MerchantAddressReadQuery;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 退款单的唯一驱动：买家申请/撤销/回寄，卖家同意/拒绝/收货/拦截/重试，系统超时与订单取消的自动退款。
 *
 * <p>状态迁移全部是条件更新（{@code WHERE status = 前置态}），影响行数即并发闸门；转移表是
 * {@link RefundStatus#TRANSITIONS}，本类只按它驱动，不另写第二张表。金额与数量在<b>申请瞬间</b>由服务端
 * 按订单行的实付与已退算出（§6.2），客户端只给行与件数。
 *
 * <p>依赖方向：order :: api（订单事实与账本命令）、payment :: api（渠道退款）、logistics :: api（回寄包裹与
 * 发货事实）、inventory / coupon（回补与退券）、shop :: api（退货地址）。本模块不写任何他方 schema。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class RefundService {

    private final RefundMapper refundMapper;

    private final RefundLineMapper refundLineMapper;

    private final OrderReadQuery orderReadQuery;

    private final RefundBadges refundBadges;

    private final RefundExecutionService refundExecutionService;

    /** 回寄包裹落 logistics（同事务）：退货物流复用正向包裹与轨迹那一套 */
    private final ReturnShipmentCommand returnShipmentCommand;

    /** 商家地址只读点查（shop :: api）：买家回寄地址在详情查询时实时解析，不落快照列 */
    private final MerchantAddressReadQuery merchantAddressReadQuery;

    // ---------------------------------------------------------------- 买家

    /**
     * 申请退款（行级）：窗口内、逐行数量不超额度、同一订单行没有进行中的退款。
     *
     * <p>金额服务端算：行实付 × 本次数量 ÷ 购买数量，向下取整；该行最后一次退款退剩余额（§6.2）。
     * 本次退款后该子订单所有行都退满时，追加一条运费行（金额 = 子订单运费）——部分退款不退运费。
     *
     * <p>「同一订单行至多一张未完结退款单」的并发闸门在 {@code uk_refund_lines_open_item} 上：
     * 先查后插在并发下必漏，插入撞唯一索引才是裁决。
     */
    @Transactional
    public RefundView apply(
            UUID userId,
            UUID orderId,
            RefundType type,
            AfterSaleReason reasonCode,
            String reason,
            List<RefundLineRequest> lines) {
        // 1. 订单事实与归属：越权与不存在同一句 404
        OrderRefundView order =
                Validate.presentOwned(orderReadQuery.refundViewById(orderId), OrderRefundView::userId, userId, "订单不存在");

        // 2. 窗口：待收货随时可申，完成后按申请截止时刻（AFS-01/02/43）
        Validate.conflict(order.refundOpenAt(OffsetDateTime.now()), "当前不可申请退款");

        // 3. 补偿只能由内部命令发起，买家入口没有这条通道（§6.3）
        Validate.isTrue(type != RefundType.COMPENSATION, "补偿不支持买家申请");

        // 4. 逐行校验并算钱：数量上限按类型分（仅退款退未发件、退货退款退已发件），金额按行实付摊
        Map<UUID, RefundLineRequest> requested = new HashMap<>();
        for (RefundLineRequest line : lines) {
            Validate.isTrue(requested.put(line.orderItemId(), line) == null, "同一订单行在一次退款里只能出现一次");
        }
        List<OrderRefundLineView> orderLines = orderReadQuery.refundLinesById(orderId);
        Map<UUID, OrderRefundLineView> byId =
                orderLines.stream().collect(Collectors.toMap(OrderRefundLineView::orderItemId, Function.identity()));
        long itemAmount = 0;
        for (RefundLineRequest line : lines) {
            OrderRefundLineView orderLine = byId.get(line.orderItemId());
            Validate.isTrue(orderLine != null, "订单行不属于该订单");
            int max = type == RefundType.RETURN_REFUND
                    ? orderLine.returnableQuantity()
                    : orderLine.unshippedRefundableQuantity();
            Validate.conflict(line.quantity() <= max, "退款数量超过该行的可退额度");
            itemAmount += amountOf(orderLine, line.quantity());
        }

        // 5. 运费行：本次退款后整个子订单都退满才退运费，金额 = 子订单运费（部分退款不退，§6.2）
        long shippingAmount = 0;
        boolean allRefunded = orderLines.stream()
                .allMatch(l -> l.refundedQuantity()
                                + (requested.containsKey(l.orderItemId())
                                        ? requested.get(l.orderItemId()).quantity()
                                        : 0)
                        == l.quantity());
        if (allRefunded && order.shippingFee().amount() > 0) {
            shippingAmount = order.shippingFee().amount();
        }
        long total = itemAmount + shippingAmount;
        long shippingLineAmount = shippingAmount;
        boolean hasShippingLine = shippingLineAmount > 0;

        // 6. 落退款单 + 行：唯一索引是并发闸门，撞上即 409
        Refund refund = Refund.builder()
                .tradeId(order.tradeId())
                .orderId(orderId)
                .userId(userId)
                .shopId(order.shopId())
                .refundNo(generateRefundNo())
                .type(type)
                .status(RefundStatus.PENDING)
                .amount(total)
                .currency(order.payAmount().currency())
                .reasonCode(reasonCode)
                .reason(Text.trimToNull(reason))
                .noReasonEnforced(enforceNoReason(type, reasonCode, order, orderLines))
                .build();
        DuplicateKeys.conflictOnDuplicate(
                () -> {
                    refundMapper.insert(refund);
                    insertItemLines(refund, lines, byId);
                    if (hasShippingLine) {
                        insertLine(refund, null, RefundLineType.SHIPPING, null, shippingLineAmount);
                    }
                },
                "该订单行已有进行中的退款");

        // 7. 角标：有一笔未完结退款即「退款中」（§5.4）
        refundBadges.refresh(orderId, order.tradeId());
        log.info(
                "[REFUND] 申请退款, refundId={}, orderId={}, type={}, amount={}, lines={}",
                refund.getId(),
                orderId,
                type,
                total,
                lines.size());
        return view(refund, buyerActions(refund), null);
    }

    /**
     * 七天无理由强制是否成立（消保法第 25 条）：四条件全中——
     * 类型为退货退款、原因是无理由、距「收到商品」未过 7 天、整单每一行的无理由声明快照都支持。
     *
     * <p>读下单快照而不是商品现值：卖家事后关掉开关抹不掉买家买到手时手上的权利。整单粒度取 allMatch：
     * 一张单里混进一件除外商品，就不整体强退，退回普通售后台阶（卖家可拒），而不是给一个整单做不到的承诺。
     */
    private boolean enforceNoReason(
            RefundType type, AfterSaleReason reasonCode, OrderRefundView order, List<OrderRefundLineView> lines) {
        if (type != RefundType.RETURN_REFUND || reasonCode != AfterSaleReason.NO_REASON) {
            return false;
        }
        OffsetDateTime receivedAt = order.receivedAt();
        if (receivedAt == null || receivedAt.plus(AfterSaleTimeouts.NO_REASON).isBefore(OffsetDateTime.now())) {
            return false;
        }
        return !lines.isEmpty() && lines.stream().allMatch(OrderRefundLineView::sevenDayReturn);
    }

    /** 买家撤销：待处理或待寄回可撤（货已寄出则不由买家撤，§8） */
    @Transactional
    public void cancel(UUID userId, UUID orderId) {
        Refund refund = requireBuyerOpen(userId, orderId);
        Validate.conflict(
                refund.getStatus() == RefundStatus.PENDING || refund.getStatus() == RefundStatus.RETURN_PENDING,
                "退款单状态已变更，当前不可撤销");
        transitionCancelled(refund);
    }

    /**
     * 回寄并填写退货物流单（仅退货退款、待寄回）：状态推进到「已寄回」并落物流。
     *
     * <p>回寄包裹落在 logistics（{@link ReturnShipmentCommand#replace}，同事务）：它之后自动享有正向包裹的
     * 一切——承运商推送按运单号就能匹配、轮询兜底会扫它、买家「查看物流」里会看到它的轨迹。售后单上的两列是
     * <b>投影</b>；轨迹真相在 logistics。
     */
    @Transactional
    public void returnGoods(UUID userId, UUID orderId, String carrierCode, String carrierName, String trackingNo) {
        Refund refund = requireBuyerOpen(userId, orderId);
        Validate.conflict(
                refund.getStatus() == RefundStatus.RETURN_PENDING || refund.getStatus() == RefundStatus.RETURNED,
                "退款单状态已变更，当前不可回寄");
        ReturnShipmentView shipment = returnShipmentCommand.replace(
                orderId, userId, refund.getShopId(), carrierCode, carrierName, trackingNo);
        OffsetDateTime now = OffsetDateTime.now();
        Validate.conflict(
                refundMapper.markReturned(
                                refund.getId(), carrierCode, shipment.carrierName(), shipment.trackingNo(), now)
                        == 1,
                "退款单状态已变更，当前不可回寄");
        refundBadges.refresh(orderId, refund.getTradeId());
        log.info(
                "[REFUND] 买家回寄, refundId={}, carrier={}, trackingNo={}",
                refund.getId(),
                shipment.carrierName(),
                shipment.trackingNo());
    }

    /** 买家详情：优先展示进行中的那笔，没有则最近一张（含终态）；从未申请过 404 */
    @Transactional(readOnly = true)
    public RefundView buyerDetailView(UUID userId, UUID orderId) {
        Refund refund = Validate.presentOwned(latestRefund(orderId), Refund::getUserId, userId, "暂无退款记录");
        return view(refund, buyerActions(refund), resolveReturnAddress(refund.getShopId()));
    }

    /** 买家可执行动作：撤销 / 回寄 / 重新申请（重新申请吃订单窗口，由本服务点查后喂给推导） */
    public List<RefundAvailableAction> buyerActions(Refund refund) {
        return RefundAvailableAction.buyerActions(refund.getStatus(), reapplyAllowed(refund));
    }

    /** 能否重新申请：终态且订单窗口仍开着（部分退款后还能就剩下的商品再申请，不再有「一单只退一次」） */
    private boolean reapplyAllowed(Refund refund) {
        RefundStatus status = refund.getStatus();
        if (status.open() || status == RefundStatus.FAILED) {
            return false;
        }
        return orderReadQuery
                .refundViewById(refund.getOrderId())
                .map(order -> order.refundOpenAt(OffsetDateTime.now()))
                .orElse(false);
    }

    // ---------------------------------------------------------------- 卖家

    /** 卖家同意：仅退款/补偿直接发起退款；退货退款只进入「待寄回」，等货回来再退 */
    @Transactional
    public void agree(UUID shopId, UUID orderId) {
        agreeAndAdvance(requireSellerOpen(shopId, orderId, RefundStatus.PENDING));
    }

    /**
     * 同意路径的分派（人工与超时共用一条落点）：先落已同意（定格 agreed_at），再按类型分岔。
     * 两条状态更新在同一事务里，外部看不到「已同意但还没决定走哪条路」的中间态。
     */
    private void agreeAndAdvance(Refund refund) {
        OffsetDateTime now = OffsetDateTime.now();
        Validate.conflict(refundMapper.markAgreed(refund.getId(), now) == 1, "退款单状态已变更，当前不可同意");
        if (refund.getType() == RefundType.RETURN_REFUND) {
            Validate.conflict(
                    refundMapper.transition(refund.getId(), RefundStatus.AGREED, RefundStatus.RETURN_PENDING) == 1,
                    "退款单状态已变更，当前不可同意");
            refundBadges.refresh(refund.getOrderId(), refund.getTradeId());
            return;
        }
        Validate.conflict(
                refundMapper.transition(refund.getId(), RefundStatus.AGREED, RefundStatus.REFUNDING) == 1,
                "退款单状态已变更，当前不可同意");
        refundExecutionService.execute(refund.getId());
    }

    /**
     * 卖家拒绝：只从待处理拒（已寄回不走拒绝——货已离开买家，卖家要么确认收货退款，要么确认拦截，§4.5）。
     *
     * <p>七天无理由强制单在待处理阶段挡掉：消保法第 25 条禁止的是「以不属于质量问题为由拒绝受理」。
     * 按钮的缺席不是授权——不信任前端的第二道门落在单上那个定格的标记列。
     */
    @Transactional
    public void reject(UUID shopId, UUID orderId, String reason) {
        Refund refund = requireSellerOpen(shopId, orderId, RefundStatus.PENDING);
        Validate.conflict(!refund.isNoReasonEnforced(), "该申请为七天无理由退货，不可拒绝受理");
        Validate.conflict(refundMapper.markRejected(refund.getId(), Text.trimToNull(reason)) == 1, "退款单状态已变更，当前不可拒绝");
        // 拒绝是未出钱的终态：让出「同一订单行一张未完结」的名额（买家可重新申请）
        refundLineMapper.deactivateByRefundId(refund.getId());
        refundBadges.refresh(refund.getOrderId(), refund.getTradeId());
        log.info("[REFUND] 卖家拒绝, refundId={}", refund.getId());
    }

    /** 卖家确认收到退货：已寄回 → 卖家已收货 → 发起退款（执行入口负责回补与结算） */
    @Transactional
    public void receiveReturn(UUID shopId, UUID orderId) {
        Refund refund = requireSellerOpen(shopId, orderId, RefundStatus.RETURNED);
        Validate.conflict(refundMapper.markReceived(refund.getId()) == 1, "退款单状态已变更，当前不可确认收货");
        Validate.conflict(
                refundMapper.transition(refund.getId(), RefundStatus.RECEIVED, RefundStatus.REFUNDING) == 1,
                "退款单状态已变更，当前不可确认收货");
        refundExecutionService.execute(refund.getId());
    }

    /** 卖家确认拦截成功：货已离开买家且不再退回，钱不出（§8「已寄落拦」） */
    @Transactional
    public void intercept(UUID shopId, UUID orderId) {
        Refund refund = requireSellerOpen(shopId, orderId, RefundStatus.RETURNED);
        transitionCancelled(refund);
    }

    /**
     * 人工重试：自动重试耗尽后的出口（失败 → 退款中 → 再次提交渠道）。
     * 渠道侧用退款单号做幂等键，重试不会退第二次。
     */
    @Transactional
    public void retry(UUID shopId, UUID orderId) {
        Refund refund = requireSellerLatest(shopId, orderId, RefundStatus.FAILED);
        Validate.conflict(refundMapper.markRetrying(refund.getId()) == 1, "退款单状态已变更，当前不可重试");
        refundExecutionService.execute(refund.getId());
    }

    /** 卖家详情：优先进行中，没有则最近一张；动作集为卖家口径 */
    @Transactional(readOnly = true)
    public RefundView sellerDetailView(UUID shopId, UUID orderId) {
        Refund refund = Validate.presentOwned(latestRefund(orderId), Refund::getShopId, shopId, "暂无退款记录");
        return view(refund, sellerActions(refund), null);
    }

    /** 卖家可执行动作（AFS-40 下发口径）：强制单的待处理阶段不给拒绝 */
    public List<RefundAvailableAction> sellerActions(Refund refund) {
        return RefundAvailableAction.sellerActions(refund.getStatus(), refund.isNoReasonEnforced());
    }

    /**
     * 卖家退款工作台：本店退款单分页（created_at 倒序，status 可筛），每行补订单摘要。
     *
     * <p>订单摘要经 order :: api 批查后内存拼装——工作台要能认出是哪一单，而订单信息不属本模块。
     */
    @Transactional(readOnly = true)
    public PageResult<SellerRefundItem> pageShop(UUID shopId, String status, PageParams page) {
        // 1. 筛选值先校验：列表参数写错要立刻 400，静默忽略等于给出一份不知怎么筛出来的数据
        RefundStatus filter = Validate.enumFilter(RefundStatus.class, status, "非法的退款状态筛选值");
        // 2. 本店退款单分页：shop_id 是归属闸门，越店看不到（不是先查再过滤）
        Page<Refund> rows = refundMapper.selectPageByShop(page, shopId, filter);
        // 3. 订单摘要批量补齐（跨模块只读点查，进 Map 后内存拼装）
        Map<UUID, OrderSummaryView> orders = orderReadQuery.summariesByIds(
                rows.getRecords().stream().map(Refund::getOrderId).distinct().toList());
        // 4. 拼装工作台行
        return new PageResult<>(
                rows.getRecords().stream()
                        .map(r ->
                                SellerRefundItem.from(r, requireSummary(orders.get(r.getOrderId())), sellerActions(r)))
                        .toList(),
                rows.getTotal());
    }

    /**
     * 一批订单的卖家退款动作（卖家订单列表行内按钮）：与工作台同一套算法。
     * 没有进行中退款单的订单不出现在结果里（前端按 orderId 取，取不到 = 无动作）。
     */
    @Transactional(readOnly = true)
    public List<SellerOrderRefundActions> sellerActionsByOrders(UUID shopId, List<UUID> orderIds) {
        if (orderIds.isEmpty()) {
            return List.of();
        }
        return refundMapper.selectOpenByOrders(shopId, orderIds).stream()
                .collect(Collectors.toMap(Refund::getOrderId, this::sellerActions, (a, b) -> a))
                .entrySet()
                .stream()
                .map(e -> new SellerOrderRefundActions(e.getKey(), e.getValue()))
                .toList();
    }

    // ---------------------------------------------------------------- 系统

    /**
     * 已付款订单取消 → 自动整单退款（同事务）。
     *
     * <p>取消是买家的既得权利（ORD-20），退款单必须随之留下痕迹：订单取消后，这笔钱要么已退回、
     * 要么停在「退款中」由重试线追。订单模块只发事件，本模块建单并执行——退款单的唯一写入口仍在 aftersale。
     *
     * <p>类型取仅退款：取消只可能从「待发货」发起（未产生任何发货），货不会再交付。
     */
    @Transactional
    public void refundCancelledOrder(UUID orderId, UUID userId) {
        OrderRefundView order =
                orderReadQuery.refundViewById(orderId).orElseThrow(() -> new IllegalStateException("取消的订单不存在，数据不一致"));
        List<OrderRefundLineView> lines = orderReadQuery.refundLinesById(orderId);
        long itemAmount = lines.stream()
                .mapToLong(OrderRefundLineView::remainingGoodsAmount)
                .sum();
        long shippingAmount = order.shippingFee().amount();
        Refund refund = Refund.builder()
                .tradeId(order.tradeId())
                .orderId(orderId)
                .userId(userId)
                .shopId(order.shopId())
                .refundNo(generateRefundNo())
                .type(RefundType.REFUND_ONLY)
                .status(RefundStatus.PENDING)
                .amount(itemAmount + shippingAmount)
                .currency(order.payAmount().currency())
                .reason("订单取消退款")
                .build();
        DuplicateKeys.conflictOnDuplicate(
                () -> {
                    refundMapper.insert(refund);
                    for (OrderRefundLineView line : lines) {
                        insertLine(
                                refund,
                                line.orderItemId(),
                                RefundLineType.ITEM,
                                line.quantity(),
                                line.remainingGoodsAmount());
                    }
                    if (shippingAmount > 0) {
                        insertLine(refund, null, RefundLineType.SHIPPING, null, shippingAmount);
                    }
                },
                "该订单已存在进行中的退款");
        // 取消退款没有卖家审核环节：直接同意 → 退款中 → 执行（状态机仍逐边走，不跳态）
        Validate.conflict(refundMapper.markAgreed(refund.getId(), OffsetDateTime.now()) == 1, "取消退款单状态异常");
        Validate.conflict(
                refundMapper.transition(refund.getId(), RefundStatus.AGREED, RefundStatus.REFUNDING) == 1, "取消退款单状态异常");
        log.info("[REFUND] 订单取消自动退款, refundId={}, orderId={}, amount={}", refund.getId(), orderId, refund.getAmount());
        refundExecutionService.execute(refund.getId());
    }

    /**
     * 卖家超时未处理 → 自动同意（AFS-23）：仅退款直接退款，退货退款进入待寄回。
     *
     * @return 是否真的落成；卖家恰好也处理了 = false，让位给人工
     */
    @Transactional
    public boolean autoAgree(UUID refundId) {
        Refund refund = refundMapper.selectById(refundId);
        if (refund == null || refund.getStatus() != RefundStatus.PENDING) {
            return false;
        }
        agreeAndAdvance(refund);
        log.info("[REFUND] 卖家超时未处理自动同意, refundId={}", refundId);
        return true;
    }

    /**
     * 买家超时未回寄 → 自动关闭（AFS-23）：「还没回寄」的守卫在同一语句里重跑，
     * 扫描与落点之间买家刚提交了回寄，就让位给他——货已在途的单绝不关。
     *
     * @return 是否真的落成
     */
    @Transactional
    public boolean autoCloseReturn(UUID refundId) {
        Refund refund = refundMapper.selectById(refundId);
        if (refund == null || refund.getStatus() != RefundStatus.RETURN_PENDING) {
            return false;
        }
        if (refundMapper.markCancelledUnshipped(refundId) != 1) {
            return false;
        }
        refundLineMapper.deactivateByRefundId(refundId);
        refundBadges.refresh(refund.getOrderId(), refund.getTradeId());
        log.info("[REFUND] 买家超时未回寄自动关闭, refundId={}", refundId);
        return true;
    }

    /**
     * 卖家超时未确认收货 → 自动确认并退款（AFS-23）：与人工确认收货走同一落点（收货 + 执行），
     * 不存在「自动那一路少回补一次」的第二套逻辑。
     *
     * @return 是否真的落成
     */
    @Transactional
    public boolean autoReceiveReturn(UUID refundId) {
        Refund refund = refundMapper.selectById(refundId);
        if (refund == null || refund.getStatus() != RefundStatus.RETURNED) {
            return false;
        }
        Validate.conflict(refundMapper.markReceived(refundId) == 1, "退款单状态已变更，自动确认收货未执行");
        Validate.conflict(
                refundMapper.transition(refundId, RefundStatus.RECEIVED, RefundStatus.REFUNDING) == 1,
                "退款单状态已变更，自动确认收货未执行");
        refundExecutionService.execute(refundId);
        log.info("[REFUND] 卖家超时未确认收货自动退款, refundId={}", refundId);
        return true;
    }

    // ---------------------------------------------------------------- 私有

    /** 撤销/拦截唯一落点：终态 + 放闸 + 角标 */
    private void transitionCancelled(Refund refund) {
        RefundStatus from = refund.getStatus();
        Validate.conflict(refundMapper.markCancelled(refund.getId(), from) == 1, "退款单状态已变更，当前不可撤销");
        refundLineMapper.deactivateByRefundId(refund.getId());
        refundBadges.refresh(refund.getOrderId(), refund.getTradeId());
        log.info("[REFUND] 退款单撤销, refundId={}, from={}", refund.getId(), from);
    }

    /** 行金额：按行实付与购买量摊，向下取整；该行最后一次退款退剩余额（§6.2，保证 INV-13/14 收口） */
    private static long amountOf(OrderRefundLineView line, int quantity) {
        long remainingQuantity = line.quantity() - line.refundedQuantity();
        if (quantity >= remainingQuantity) {
            return line.remainingGoodsAmount();
        }
        return line.goodsPaidAmount().amount() * quantity / line.quantity();
    }

    private void insertItemLines(Refund refund, List<RefundLineRequest> lines, Map<UUID, OrderRefundLineView> byId) {
        for (RefundLineRequest line : lines) {
            insertLine(
                    refund,
                    line.orderItemId(),
                    RefundLineType.ITEM,
                    line.quantity(),
                    amountOf(byId.get(line.orderItemId()), line.quantity()));
        }
    }

    private void insertLine(Refund refund, UUID orderItemId, RefundLineType type, Integer quantity, long amount) {
        refundLineMapper.insert(RefundLine.builder()
                .refundId(refund.getId())
                .orderItemId(orderItemId)
                .lineType(type)
                .quantity(quantity)
                .amount(amount)
                .currency(refund.getCurrency())
                .active(true)
                .build());
    }

    /** 详情出参：行名从订单行补（退款单只存 id，商品名归订单快照） */
    private RefundView view(Refund refund, List<RefundAvailableAction> actions, String returnAddress) {
        List<RefundLine> lines = refundLineMapper.selectByRefundId(refund.getId());
        Map<UUID, String> names = orderReadQuery.refundLinesById(refund.getOrderId()).stream()
                .collect(Collectors.toMap(OrderRefundLineView::orderItemId, OrderRefundLineView::name));
        return RefundView.from(refund, lines, names, actions, returnAddress);
    }

    /** 优先进行中，没有则最近一张（含终态） */
    private Optional<Refund> latestRefund(UUID orderId) {
        Refund open = refundMapper.selectLatestOpenByOrder(orderId);
        return Optional.ofNullable(open != null ? open : refundMapper.selectLatestByOrder(orderId));
    }

    /** 进行中的单：没有 → 409（用该动作的默认文案），不属于该买家 → 404，不泄露单据存在性 */
    private Refund requireBuyerOpen(UUID userId, UUID orderId) {
        Refund refund = refundMapper.selectLatestOpenByOrder(orderId);
        Validate.conflict(refund != null, "退款单状态已变更，请刷新后重试");
        return Validate.requireOwned(refund, Refund::getUserId, userId, "订单不存在");
    }

    private Refund requireSellerOpen(UUID shopId, UUID orderId, RefundStatus expected) {
        Refund refund = refundMapper.selectLatestOpenByOrder(orderId);
        Validate.conflict(refund != null, "退款单状态已变更，请刷新后重试");
        Validate.requireOwned(refund, Refund::getShopId, shopId, "订单不存在");
        Validate.conflict(refund.getStatus() == expected, "退款单状态已变更，请刷新后重试");
        return refund;
    }

    private Refund requireSellerLatest(UUID shopId, UUID orderId, RefundStatus expected) {
        Refund refund = Validate.presentOwned(latestRefund(orderId), Refund::getShopId, shopId, "订单不存在");
        Validate.conflict(refund.getStatus() == expected, "退款单状态已变更，请刷新后重试");
        return refund;
    }

    /** 工作台行缺订单摘要说明数据被外力改坏：直接失败，而不是给出一行没有订单号的退款单 */
    private static OrderSummaryView requireSummary(OrderSummaryView order) {
        if (order == null) {
            throw new IllegalStateException("退款单对应的订单不存在，数据不一致");
        }
        return order;
    }

    /**
     * 回寄地址（AFS-42）：本店默认退货地址折成一行「收件人 电话 · 省市区详址」。
     * 实时解析而不是申请时定格——退地址不是资金口径，卖家改了买家就该寄新的。
     */
    public String resolveReturnAddress(UUID shopId) {
        return merchantAddressReadQuery
                .resolveReturnTo(shopId)
                .map(RefundService::formatReturnAddress)
                .orElse(null);
    }

    private static String formatReturnAddress(AddressSnapshot address) {
        String district = address.district() == null ? "" : address.district();
        return address.contactName() + " " + address.phone() + " · " + address.province() + address.city() + district
                + address.detail();
    }

    /** 退款单号：前缀 + 时间戳 + 主键随机段，只含字母数字（渠道幂等键要求），生成口径见 {@link RefundNumbers} */
    private static String generateRefundNo() {
        return RefundNumbers.next("RF");
    }
}
