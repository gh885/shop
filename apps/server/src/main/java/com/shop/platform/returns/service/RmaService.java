package com.shop.platform.returns.service;

import com.shop.platform.clearing.api.ClearingCommand;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.ForbiddenException;
import com.shop.platform.infra.web.CursorCodec;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.inventory.api.RestockRequest;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.returns.api.CaseView;
import com.shop.platform.returns.api.RmaCommand;
import com.shop.platform.returns.api.RmaQuery;
import com.shop.platform.returns.mapper.CaseMapper;
import com.shop.platform.returns.model.RefundAmount;
import com.shop.platform.returns.model.Rma;
import com.shop.platform.returns.model.Rma.CaseStatus;
import com.shop.platform.returns.model.Rma.CaseType;
import com.shop.platform.returns.model.Rma.DeadlineAction;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.api.TradeQuery;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 售后的全部业务逻辑。
 *
 * <p>三条不能改的：
 *
 * <ul>
 *   <li><b>钱不经过这里。</b> 只发 {@code ReturnApproved}，渠道退款是 payment 的事
 *   <li><b>退款上限是实付，不是原价。</b> 金额从 {@code trade.findRefundable} 拿，那里给的是扣过优惠的 payableAmount
 *   <li><b>每次推进都写 case_log。</b> 没有它，「这单为什么给退了」只能靠猜
 * </ul>
 */
@Component
public class RmaService implements RmaCommand, RmaQuery {

    /** 商家处理时限：48 小时不处理自动同意。 */
    private static final Duration MERCHANT_WINDOW = Duration.ofHours(48);

    /** 买家寄回时限：7 天不寄视为放弃。 */
    private static final Duration BUYER_WINDOW = Duration.ofDays(7);

    /**
     * 寄回在途的兜底时限。
     *
     * <p>文档写的是「商家收货后 48 小时」，但系统不知道货什么时候到——快递没有回传。
     * 所以给 7 天兜底：到点还没确认收货就自动退款，防止商家用"没收到"无限拖。
     */
    private static final Duration TRANSIT_WINDOW = Duration.ofDays(7);

    private final CaseMapper cases;
    private final TradeQuery trade;
    private final TradeCommand tradeCommand;
    private final PaymentCommand payments;
    private final ClearingCommand clearing;
    private final InventoryCommand inventory;

    public RmaService(
            CaseMapper cases,
            TradeQuery trade,
            TradeCommand tradeCommand,
            PaymentCommand payments,
            ClearingCommand clearing,
            InventoryCommand inventory) {
        this.cases = Objects.requireNonNull(cases, "cases");
        this.trade = Objects.requireNonNull(trade, "trade");
        this.tradeCommand = Objects.requireNonNull(tradeCommand, "tradeCommand");
        this.payments = Objects.requireNonNull(payments, "payments");
        this.clearing = Objects.requireNonNull(clearing, "clearing");
        this.inventory = Objects.requireNonNull(inventory, "inventory");
    }

    @Override
    @Transactional
    public CaseView apply(ApplyRequest request) {
        CaseType type = parseType(request.type());
        List<Computed> computed = compute(request);
        UUID merchantId = computed.getFirst().line().merchantId();
        UUID shopId = computed.getFirst().line().shopId();
        UUID sellerOrderId = computed.getFirst().line().sellerOrderId();
        String currency = computed.getFirst().line().currency();

        // 先上锁再查"有没有未终态 case"：查和插之间的窗口就是同一行被退两次的窗口
        for (Computed item : computed) {
            cases.lockLine(item.line().orderLineId());
            cases.openCaseOfLine(item.line().orderLineId()).ifPresent(open -> {
                throw BusinessException.conflict("这个订单行已有未完成的售后: " + open);
            });
        }

        long total = computed.stream().mapToLong(Computed::amount).sum();
        UUID caseId = Ids.newId();
        Instant now = Instant.now();

        cases.insertCase(new CaseMapper.NewCase(
                caseId,
                BizNo.of("AS", LocalDate.now()),
                sellerOrderId,
                merchantId,
                shopId,
                request.buyerId(),
                type.dbValue(),
                CaseStatus.APPLIED.dbValue(),
                request.reasonCode(),
                Rma.responsibilityOf(request.reasonCode()).dbValue(),
                total,
                0L,
                currency,
                now.plus(MERCHANT_WINDOW),
                "merchant",
                DeadlineAction.AUTO_APPROVE.dbValue()));

        for (Computed item : computed) {
            cases.insertItem(caseId, item.line().orderLineId(), item.quantity(), item.amount());
        }
        cases.insertLog(caseId, null, CaseStatus.APPLIED.dbValue(), "buyer", request.buyerId(), request.reasonCode());

        // 单子一落库就把钱冻上：不冻的话，结算任务可能在处理期间把钱打给商家
        clearing.hold(caseId, sellerOrderId, total, currency);

        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView approve(UUID caseId, AccessScope.Seller scope) {
        CaseMapper.CaseRow row = ownedByMerchant(caseId, scope);
        requireStatus(row, CaseStatus.APPLIED);

        if (CaseType.valueOf(row.type().toUpperCase()).needsGoodsBack()) {
            // 要寄回：等买家填运单号，7 天不寄视为放弃
            advance(
                    row,
                    CaseStatus.APPROVED,
                    Instant.now().plus(BUYER_WINDOW),
                    "buyer",
                    DeadlineAction.AUTO_CLOSE,
                    "merchant",
                    scope.merchantId(),
                    "商家同意");
            return view(caseId);
        }
        // 仅退款：同意即退，没有中间那段
        startRefund(row, "merchant", scope.merchantId(), "商家同意，直接退款", scope.refundCap());
        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView reject(UUID caseId, AccessScope.Seller scope, String reason) {
        CaseMapper.CaseRow row = ownedByMerchant(caseId, scope);
        requireStatus(row, CaseStatus.APPLIED);
        advance(row, CaseStatus.REJECTED, null, null, null, "merchant", scope.merchantId(), reason);
        clearing.releaseHold(caseId);
        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView cancel(UUID caseId, UUID buyerId) {
        CaseMapper.CaseRow row = ownedBy(caseId, buyerId);
        // CAS 只防并发，不防非法迁移：不挡的话"被拒"能被改写成"买家撤销"，
        // 拒绝记录失真，事后查"这单为什么没退"就只剩一个被覆盖的说法
        CaseStatus status = CaseStatus.valueOf(row.status().toUpperCase(Locale.ROOT));
        if (status.terminal()) {
            throw BusinessException.conflict("售后单已终态，不能撤销: " + row.status());
        }
        if (status == CaseStatus.REFUNDING) {
            throw BusinessException.conflict("退款已发起，不能撤销");
        }
        advance(row, CaseStatus.CANCELLED, null, null, null, "buyer", buyerId, "买家撤销");
        clearing.releaseHold(caseId);
        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView shipBack(UUID caseId, UUID buyerId, String carrierCode, String trackingNo) {
        CaseMapper.CaseRow row = ownedBy(caseId, buyerId);
        requireStatus(row, CaseStatus.APPROVED);
        advance(
                row,
                CaseStatus.SHIPPING_BACK,
                Instant.now().plus(TRANSIT_WINDOW),
                "merchant",
                DeadlineAction.AUTO_REFUND,
                "buyer",
                buyerId,
                carrierCode + " " + trackingNo);
        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView receive(UUID caseId, AccessScope.Seller scope) {
        CaseMapper.CaseRow row = ownedByMerchant(caseId, scope);
        requireStatus(row, CaseStatus.SHIPPING_BACK);
        advance(
                row,
                CaseStatus.RECEIVED,
                Instant.now().plus(MERCHANT_WINDOW),
                "merchant",
                DeadlineAction.AUTO_REFUND,
                "merchant",
                scope.merchantId(),
                "商家签收");
        // 货真的回到仓里了，所以才入库。挂在"退款成功"上会让超时兜底那条路（货还没寄到就自动退款）
        // 给一批不存在的货记账
        restockReceived(row);
        return view(caseId);
    }

    /**
     * 签收退货后把货记回库存。
     *
     * <p><b>触发点是「商家签收」而不是「退款成功」。</b> 入库的事实是"货回到仓里了"，退款只是钱的事；
     * 两者之间隔着一段物流，按钱记账就等于按一个还没发生的事实记账。
     *
     * <p>SKU 与行号从 {@code trade.findShippable} 取：售后单只存 {@code order_line_id}，
     * 而库存的幂等键要 {@code line_no}。这条链路 returns 本来就走，不新增依赖。
     *
     * <p>查不到行就跳过而不是抛：售后单可能指向一行后来被整单取消的订单，
     * 那时没有货可回补，抛异常只会让商家卡在"确认收到退货"上按不下去。
     */
    private void restockReceived(CaseMapper.CaseRow row) {
        List<CaseMapper.ItemRow> items = cases.findItems(row.id());
        if (items.isEmpty()) {
            return;
        }
        Map<UUID, TradeQuery.ShippableLine> byLineId = trade.findShippable(row.sellerOrderId())
                .map(shippable -> shippable.lines().stream()
                        .collect(Collectors.toMap(TradeQuery.ShippableLine::orderLineId, line -> line)))
                .orElse(Map.of());

        List<RestockRequest.Line> lines = new ArrayList<>();
        for (CaseMapper.ItemRow item : items) {
            TradeQuery.ShippableLine line = byLineId.get(item.orderLineId());
            if (line != null) {
                lines.add(new RestockRequest.Line(line.skuId(), line.lineNo(), item.quantity()));
            }
        }
        if (lines.isEmpty()) {
            return;
        }
        inventory.restock(new RestockRequest(row.id(), row.merchantId(), lines));
    }

    @Override
    @Transactional
    public CaseView confirmRefund(UUID caseId, AccessScope.Seller scope) {
        CaseMapper.CaseRow row = ownedByMerchant(caseId, scope);
        if (!row.status().equals(CaseStatus.RECEIVED.dbValue())
                && !row.status().equals(CaseStatus.APPROVED.dbValue())) {
            throw BusinessException.conflict("当前状态不能确认退款: " + row.status());
        }
        startRefund(row, "merchant", scope.merchantId(), "商家确认退款", scope.refundCap());
        return view(caseId);
    }

    /**
     * 超时推进。扫描器只执行 {@code deadline_action}，不判断业务——加一条新规则是加一个枚举值。
     *
     * @return 推进了几个
     */
    @Transactional
    public int autoAdvance(CaseMapper.CaseRow row) {
        DeadlineAction action = DeadlineAction.valueOf(row.deadlineAction().toUpperCase());
        return switch (action) {
            case AUTO_APPROVE -> {
                if (CaseType.valueOf(row.type().toUpperCase()).needsGoodsBack()) {
                    advance(
                            row,
                            CaseStatus.APPROVED,
                            Instant.now().plus(BUYER_WINDOW),
                            "buyer",
                            DeadlineAction.AUTO_CLOSE,
                            "system",
                            null,
                            "48 小时未处理，自动同意");
                } else {
                    startRefund(row, "system", null, "48 小时未处理，自动同意并退款", null);
                }
                yield 1;
            }
            case AUTO_CLOSE -> {
                advance(row, CaseStatus.CANCELLED, null, null, null, "system", null, "超时未寄回，自动关闭");
                clearing.releaseHold(row.id());
                yield 1;
            }
            case AUTO_REFUND -> {
                startRefund(row, "system", null, "超时未处理，自动退款", null);
                yield 1;
            }
            case AUTO_SHIP -> 0;
        };
    }

    /** 售后单完成：由退款成功事件驱动，退款没到账之前状态不动。 */
    @Transactional
    public void completeAfterRefund(UUID caseId) {
        CaseMapper.CaseRow row =
                cases.findInternal(caseId).orElseThrow(() -> BusinessException.notFound("售后单不存在: " + caseId));
        if (row.status().equals(CaseStatus.COMPLETED.dbValue())) {
            return;
        }
        if (!row.status().equals(CaseStatus.REFUNDING.dbValue())) {
            throw BusinessException.conflict("只有退款中的售后单能完成: " + row.status());
        }

        List<CaseMapper.ItemRow> items = cases.findItems(caseId);
        tradeCommand.recordRefund(
                row.sellerOrderId(),
                items.stream()
                        .map(item ->
                                new TradeCommand.RefundLine(item.orderLineId(), item.quantity(), item.refundAmount()))
                        .toList());

        advance(row, CaseStatus.COMPLETED, null, null, null, "system", null, "退款到账");
    }

    @Override
    public Optional<CaseView> findForMerchant(UUID caseId, AccessScope.Seller scope) {
        if (scope.coversNoShop()) {
            return Optional.empty();
        }
        return cases.findForMerchant(caseId, scope).map(row -> toView(row, cases.findItems(caseId)));
    }

    @Override
    public Optional<CaseView> findForBuyer(UUID caseId, UUID buyerId) {
        return cases.findForBuyer(caseId, buyerId).map(row -> toView(row, cases.findItems(caseId)));
    }

    @Override
    public RmaQuery.CasePage pageByBuyer(UUID buyerId, String type, String status, String cursor, int limit) {
        CursorCodec.Point point = decode(cursor);
        return page(
                cases.listByBuyer(
                        buyerId,
                        requireKnownType(type),
                        requireKnownStatus(status),
                        point == null ? null : point.createdAt(),
                        point == null ? null : point.id(),
                        limit + 1),
                limit);
    }

    @Override
    public RmaQuery.CasePage pageByMerchant(
            AccessScope.Seller scope, String type, String status, String cursor, int limit) {
        if (scope.coversNoShop()) {
            return new RmaQuery.CasePage(List.of(), null);
        }
        CursorCodec.Point point = decode(cursor);
        return page(
                cases.listByMerchant(
                        scope,
                        requireKnownType(type),
                        requireKnownStatus(status),
                        point == null ? null : point.createdAt(),
                        point == null ? null : point.id(),
                        limit + 1),
                limit);
    }

    /** 筛选词表是库里的 {@code db_value}，大小写对不上等于永远筛出空页，当场拒掉。 */
    static String requireKnownType(String type) {
        if (type == null || CASE_TYPES.contains(type)) {
            return type;
        }
        // 前端按 400 处理即可，无需分支，不占错误码注册表
        throw BusinessException.badRequest("type 只能是: " + String.join(", ", CASE_TYPES));
    }

    static String requireKnownStatus(String status) {
        if (status == null || CASE_STATUSES.contains(status)) {
            return status;
        }
        throw BusinessException.badRequest("status 只能是: " + String.join(", ", CASE_STATUSES));
    }

    private static final Set<String> CASE_TYPES =
            Arrays.stream(CaseType.values()).map(CaseType::dbValue).collect(Collectors.toUnmodifiableSet());

    private static final Set<String> CASE_STATUSES =
            Arrays.stream(CaseStatus.values()).map(CaseStatus::dbValue).collect(Collectors.toUnmodifiableSet());

    private static CursorCodec.Point decode(String cursor) {
        return cursor == null ? null : CursorCodec.decode(cursor);
    }

    private RmaQuery.CasePage page(List<CaseMapper.CaseRow> rows, int limit) {
        boolean hasMore = rows.size() > limit;
        List<CaseMapper.CaseRow> page = hasMore ? rows.subList(0, limit) : rows;
        String nextCursor = hasMore && !page.isEmpty()
                ? CursorCodec.encode(page.getLast().createdAt(), page.getLast().id())
                : null;
        return new RmaQuery.CasePage(toViews(page), nextCursor);
    }

    // ── 内部 ──────────────────────────────────────────────────────────────

    /** 列表页装配：明细一次取回按 case 分组，不再每个 case 一条查询。 */
    private List<CaseView> toViews(List<CaseMapper.CaseRow> rows) {
        Map<UUID, List<CaseMapper.ItemRow>> itemsByCase =
                cases.findItemsByCases(rows.stream().map(CaseMapper.CaseRow::id).toList()).stream()
                        .collect(Collectors.groupingBy(CaseMapper.ItemRow::caseId));
        return rows.stream()
                .map(row -> toView(row, itemsByCase.getOrDefault(row.id(), List.of())))
                .toList();
    }

    /**
     * 进 {@code refunding} 并立刻发起退款。
     *
     * <p>钱到账才算完成：渠道受理成功就当场推到 {@code completed}（计数器同时回写 trade）；
     * 渠道没受理就停在 {@code refunding}，payment 的 {@code RefundRetryJob} 会重试，
     * 成功事件到了由 {@code RefundSucceededHandler} 推到完成——**不能假装退成功**。
     *
     * @param refundCap 发起方的角色退款上限（分），null = 不限。系统路径（超时自动退款）传 null：
     *     上限约束的是「人能批多少」，不是「流程允许多少」——上限是岗位描述的一部分，定时任务没有岗位
     */
    private void startRefund(
            CaseMapper.CaseRow row, String operatorType, UUID operatorId, String reason, Long refundCap) {
        if (refundCap != null && row.refundAmount() > refundCap) {
            // 上限是角色退款的最大额度，超了就是越权动钱，不是状态冲突
            throw new ForbiddenException("退款金额超过角色退款上限: " + row.refundAmount() + " > " + refundCap);
        }
        CaseMapper.CaseRow current =
                advance(row, CaseStatus.REFUNDING, null, null, null, operatorType, operatorId, reason);

        UUID orderGroupId = trade.findRefundable(
                        cases.findItems(current.id()).getFirst().orderLineId())
                .map(TradeQuery.RefundableLine::orderGroupId)
                .orElseThrow(() -> BusinessException.conflict("订单行已不存在: " + current.id()));

        PaymentCommand.Refund result = payments.refund(
                orderGroupId,
                current.sellerOrderId(),
                current.refundAmount(),
                current.currency(),
                current.id().toString());

        if (result.success()) {
            completeAfterRefund(current.id());
        }
    }

    private CaseMapper.CaseRow advance(
            CaseMapper.CaseRow row,
            CaseStatus next,
            Instant deadlineAt,
            String deadlineActor,
            DeadlineAction deadlineAction,
            String operatorType,
            UUID operatorId,
            String reason) {
        Instant approvedAt = next == CaseStatus.APPROVED ? Instant.now() : null;
        Instant completedAt = next.terminal() ? Instant.now() : null;
        boolean moved = cases.advance(
                row.id(),
                row.status(),
                next.dbValue(),
                deadlineAt,
                deadlineActor,
                deadlineAction == null ? null : deadlineAction.dbValue(),
                approvedAt,
                completedAt);
        if (!moved) {
            throw BusinessException.conflict("售后单状态已变化，请刷新: " + row.id());
        }
        cases.insertLog(row.id(), row.status(), next.dbValue(), operatorType, operatorId, reason);
        return cases.findInternal(row.id()).orElseThrow();
    }

    /**
     * 提交时的校验与算钱。
     *
     * <p>所有行必须属于同一个买家、同一个子单、同一个商家——一个售后单跨商家，
     * 判责和结算都没法落。
     */
    private List<Computed> compute(ApplyRequest request) {
        List<Computed> result = new ArrayList<>(request.lines().size());
        UUID sellerOrderId = null;
        UUID merchantId = null;

        for (ApplyRequest.Line line : request.lines()) {
            TradeQuery.RefundableLine row = trade.findRefundable(request.sellerOrderId(), line.lineNo())
                    .orElseThrow(() -> BusinessException.notFound("订单行不存在: " + line.lineNo()));
            if (!row.buyerId().equals(request.buyerId())) {
                throw BusinessException.notFound("订单行不存在: " + line.lineNo());
            }
            if (sellerOrderId != null && !sellerOrderId.equals(row.sellerOrderId())) {
                throw BusinessException.badRequest("一次售后只能针对同一个子单");
            }
            if (merchantId != null && !merchantId.equals(row.merchantId())) {
                throw BusinessException.badRequest("一次售后只能针对同一个商家");
            }
            sellerOrderId = row.sellerOrderId();
            merchantId = row.merchantId();

            int remainingQty = row.quantity() - row.refundedQty();
            long remainingPayable = row.payableAmount() - row.refundedAmount();
            if (remainingQty <= 0) {
                // 已经全退完了。这是买家能撞上的正常情况，必须给 409 而不是 500
                throw BusinessException.conflict("这一行已经全部退完: lineNo=" + line.lineNo());
            }
            if (line.quantity() > remainingQty) {
                throw BusinessException.badRequest("退款件数超过剩余可退: " + line.quantity() + " > " + remainingQty);
            }
            long amount = RefundAmount.of(remainingPayable, remainingQty, line.quantity());
            result.add(new Computed(row, line.quantity(), amount));
        }
        return result;
    }

    private CaseMapper.CaseRow ownedBy(UUID caseId, UUID buyerId) {
        CaseMapper.CaseRow row =
                cases.findInternal(caseId).orElseThrow(() -> BusinessException.notFound("售后单不存在: " + caseId));
        // 别人的售后单一律当不存在：告诉对方"这不是你的"等于确认了这个 id 存在
        if (!row.buyerId().equals(buyerId)) {
            throw BusinessException.notFound("售后单不存在: " + caseId);
        }
        return row;
    }

    /**
     * 商家归属 + 店铺范围两道判决，都折 404——「存在但无权」的确认本身就是信息泄露。
     * 店铺范围随凭据进来（{@code AccessScope.Seller}，源自 operator_shop 授权）：
     * 子账号只碰授权店的售后。
     */
    private CaseMapper.CaseRow ownedByMerchant(UUID caseId, AccessScope.Seller scope) {
        if (scope.coversNoShop()) {
            // 一个店都没授权 → 什么都没有。方向搞反就是从小越权。
            throw BusinessException.notFound("售后单不存在: " + caseId);
        }
        // 归属与店铺范围都写在 SQL 谓词里，查空即 404——不再"先查出来再在 Java 里比对"，
        // 那种写法每新增一条读就多一个忘比对的机会。
        return cases.findForMerchant(caseId, scope).orElseThrow(() -> BusinessException.notFound("售后单不存在: " + caseId));
    }

    private void requireStatus(CaseMapper.CaseRow row, CaseStatus expected) {
        if (!row.status().equals(expected.dbValue())) {
            throw BusinessException.conflict("当前状态不能做这个操作: " + row.status());
        }
    }

    private CaseView view(UUID caseId) {
        CaseMapper.CaseRow row = cases.findInternal(caseId).orElseThrow();
        return toView(row, cases.findItems(caseId));
    }

    private CaseView toView(CaseMapper.CaseRow row, List<CaseMapper.ItemRow> items) {
        return new CaseView(
                row.id(),
                row.caseNo(),
                row.sellerOrderId(),
                row.buyerId(),
                row.merchantId(),
                row.type(),
                row.status(),
                row.reasonCode(),
                row.responsibility(),
                row.refundAmount(),
                row.shippingRefundAmount(),
                row.currency(),
                row.deadlineAt(),
                row.deadlineActor(),
                row.deadlineAction(),
                row.createdAt(),
                items.stream()
                        .map(item -> new CaseView.ItemView(item.orderLineId(), item.quantity(), item.refundAmount()))
                        .toList());
    }

    private static CaseType parseType(String type) {
        try {
            return CaseType.valueOf(type.toUpperCase());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw BusinessException.badRequest("不支持的售后类型: " + type);
        }
    }

    private record Computed(TradeQuery.RefundableLine line, int quantity, long amount) {}
}
