package com.shop.platform.returns.service;

import com.shop.platform.clearing.api.ClearingCommand;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.returns.api.AfterSaleCommand;
import com.shop.platform.returns.api.AfterSaleQuery;
import com.shop.platform.returns.api.CaseView;
import com.shop.platform.returns.mapper.CaseStore;
import com.shop.platform.returns.model.AfterSale;
import com.shop.platform.returns.model.AfterSale.CaseStatus;
import com.shop.platform.returns.model.AfterSale.CaseType;
import com.shop.platform.returns.model.AfterSale.DeadlineAction;
import com.shop.platform.returns.model.RefundAmount;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.api.TradeQuery;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 售后的全部业务逻辑。
 *
 * <p>三条不能改的：
 *
 * <ul>
 *   <li><b>钱不经过这里。</b> 只发 {@code ReturnApproved}，渠道退款是 payment 的事
 *   <li><b>退款上限是实付，不是原价。</b> 金额从 {@code trade.findRefundable} 拿，那里给的是扣过优惠的 payable
 *   <li><b>每次推进都写 case_log。</b> 没有它，「这单为什么给退了」只能靠猜
 * </ul>
 */
@Component
public class AfterSaleService implements AfterSaleCommand, AfterSaleQuery {

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

    private final CaseStore cases;
    private final TradeQuery trade;
    private final TradeCommand tradeCommand;
    private final PaymentCommand payments;
    private final ClearingCommand clearing;

    public AfterSaleService(
            CaseStore cases,
            TradeQuery trade,
            TradeCommand tradeCommand,
            PaymentCommand payments,
            ClearingCommand clearing) {
        this.cases = Objects.requireNonNull(cases, "cases");
        this.trade = Objects.requireNonNull(trade, "trade");
        this.tradeCommand = Objects.requireNonNull(tradeCommand, "tradeCommand");
        this.payments = Objects.requireNonNull(payments, "payments");
        this.clearing = Objects.requireNonNull(clearing, "clearing");
    }

    @Override
    @Transactional
    public CaseView apply(ApplyRequest request) {
        CaseType type = parseType(request.type());
        List<Computed> computed = compute(request);
        UUID merchantId = computed.getFirst().line().merchantId();
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

        cases.insertCase(new CaseStore.NewCase(
                caseId,
                BizNo.of("AS", LocalDate.now()),
                sellerOrderId,
                merchantId,
                request.buyerId(),
                type.dbValue(),
                CaseStatus.APPLIED.dbValue(),
                request.reasonCode(),
                AfterSale.responsibilityOf(request.reasonCode()).dbValue(),
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
        clearing.freeze(caseId, sellerOrderId, total, currency);

        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView approve(UUID caseId, UUID merchantId) {
        CaseStore.CaseRow row = ownedByMerchant(caseId, merchantId);
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
                    merchantId,
                    "商家同意");
            return view(caseId);
        }
        // 仅退款：同意即退，没有中间那段
        startRefund(row, "merchant", merchantId, "商家同意，直接退款");
        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView reject(UUID caseId, UUID merchantId, String reason) {
        CaseStore.CaseRow row = ownedByMerchant(caseId, merchantId);
        requireStatus(row, CaseStatus.APPLIED);
        advance(row, CaseStatus.REJECTED, null, null, null, "merchant", merchantId, reason);
        clearing.unfreeze(caseId);
        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView cancel(UUID caseId, UUID buyerId) {
        CaseStore.CaseRow row = ownedBy(caseId, buyerId);
        if (row.status().equals(CaseStatus.REFUNDING.dbValue())
                || row.status().equals(CaseStatus.COMPLETED.dbValue())) {
            throw BusinessException.conflict("退款已发起，不能撤销");
        }
        advance(row, CaseStatus.CANCELLED, null, null, null, "buyer", buyerId, "买家撤销");
        clearing.unfreeze(caseId);
        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView shipBack(UUID caseId, UUID buyerId, String carrierCode, String trackingNo) {
        CaseStore.CaseRow row = ownedBy(caseId, buyerId);
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
    public CaseView receive(UUID caseId, UUID merchantId) {
        CaseStore.CaseRow row = ownedByMerchant(caseId, merchantId);
        requireStatus(row, CaseStatus.SHIPPING_BACK);
        advance(
                row,
                CaseStatus.RECEIVED,
                Instant.now().plus(MERCHANT_WINDOW),
                "merchant",
                DeadlineAction.AUTO_REFUND,
                "merchant",
                merchantId,
                "商家签收");
        return view(caseId);
    }

    @Override
    @Transactional
    public CaseView confirmRefund(UUID caseId, UUID merchantId) {
        CaseStore.CaseRow row = ownedByMerchant(caseId, merchantId);
        if (!row.status().equals(CaseStatus.RECEIVED.dbValue())
                && !row.status().equals(CaseStatus.APPROVED.dbValue())) {
            throw BusinessException.conflict("当前状态不能确认退款: " + row.status());
        }
        startRefund(row, "merchant", merchantId, "商家确认退款");
        return view(caseId);
    }

    /**
     * 超时推进。扫描器只执行 {@code deadline_action}，不判断业务——加一条新规则是加一个枚举值。
     *
     * @return 推进了几个
     */
    @Transactional
    public int autoAdvance(CaseStore.CaseRow row) {
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
                    startRefund(row, "system", null, "48 小时未处理，自动同意并退款");
                }
                yield 1;
            }
            case AUTO_CLOSE -> {
                advance(row, CaseStatus.CANCELLED, null, null, null, "system", null, "超时未寄回，自动关闭");
                clearing.unfreeze(row.id());
                yield 1;
            }
            case AUTO_REFUND -> {
                startRefund(row, "system", null, "超时未处理，自动退款");
                yield 1;
            }
            case AUTO_SHIP -> 0;
        };
    }

    /** 售后单完成：由退款成功事件驱动，退款没到账之前状态不动。 */
    @Transactional
    public void completeAfterRefund(UUID caseId) {
        CaseStore.CaseRow row = cases.find(caseId).orElseThrow(() -> BusinessException.notFound("售后单不存在: " + caseId));
        if (row.status().equals(CaseStatus.COMPLETED.dbValue())) {
            return;
        }
        if (!row.status().equals(CaseStatus.REFUNDING.dbValue())) {
            throw BusinessException.conflict("只有退款中的售后单能完成: " + row.status());
        }

        List<CaseStore.ItemRow> items = cases.findItems(caseId);
        tradeCommand.recordRefund(
                row.sellerOrderId(),
                items.stream()
                        .map(item ->
                                new TradeCommand.RefundLine(item.orderLineId(), item.quantity(), item.refundAmount()))
                        .toList());

        advance(row, CaseStatus.COMPLETED, null, null, null, "system", null, "退款到账");
    }

    @Override
    public java.util.Optional<CaseView> find(UUID caseId) {
        return cases.find(caseId).map(row -> toView(row, cases.findItems(caseId)));
    }

    @Override
    public List<CaseView> listByBuyer(UUID buyerId, int limit) {
        return cases.listByBuyer(buyerId, limit).stream()
                .map(row -> toView(row, cases.findItems(row.id())))
                .toList();
    }

    @Override
    public List<CaseView> listByMerchant(UUID merchantId, int limit) {
        return cases.listByMerchant(merchantId, limit).stream()
                .map(row -> toView(row, cases.findItems(row.id())))
                .toList();
    }

    // ── 内部 ──────────────────────────────────────────────────────────────

    /**
     * 进 {@code refunding} 并立刻发起退款。
     *
     * <p>钱到账才算完成：渠道受理成功就当场推到 {@code completed}（计数器同时回写 trade）；
     * 渠道没受理就停在 {@code refunding}，payment 的 {@code RefundRetryJob} 会重试，
     * 成功事件到了由 {@code RefundSucceededHandler} 推到完成——**不能假装退成功**。
     */
    private void startRefund(CaseStore.CaseRow row, String actorType, UUID actorId, String reason) {
        CaseStore.CaseRow current = advance(row, CaseStatus.REFUNDING, null, null, null, actorType, actorId, reason);

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

    private CaseStore.CaseRow advance(
            CaseStore.CaseRow row,
            CaseStatus next,
            Instant deadlineAt,
            String deadlineActor,
            DeadlineAction deadlineAction,
            String actorType,
            UUID actorId,
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
        cases.insertLog(row.id(), row.status(), next.dbValue(), actorType, actorId, reason);
        return cases.find(row.id()).orElseThrow();
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
            long remainingPayable = row.payable() - row.refundedAmount();
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

    private CaseStore.CaseRow ownedBy(UUID caseId, UUID buyerId) {
        CaseStore.CaseRow row = cases.find(caseId).orElseThrow(() -> BusinessException.notFound("售后单不存在: " + caseId));
        // 别人的售后单一律当不存在：告诉对方"这不是你的"等于确认了这个 id 存在
        if (!row.buyerId().equals(buyerId)) {
            throw BusinessException.notFound("售后单不存在: " + caseId);
        }
        return row;
    }

    private CaseStore.CaseRow ownedByMerchant(UUID caseId, UUID merchantId) {
        CaseStore.CaseRow row = cases.find(caseId).orElseThrow(() -> BusinessException.notFound("售后单不存在: " + caseId));
        if (!row.merchantId().equals(merchantId)) {
            throw BusinessException.notFound("售后单不存在: " + caseId);
        }
        return row;
    }

    private void requireStatus(CaseStore.CaseRow row, CaseStatus expected) {
        if (!row.status().equals(expected.dbValue())) {
            throw BusinessException.conflict("当前状态不能做这个操作: " + row.status());
        }
    }

    private CaseView view(UUID caseId) {
        CaseStore.CaseRow row = cases.find(caseId).orElseThrow();
        return toView(row, cases.findItems(caseId));
    }

    private CaseView toView(CaseStore.CaseRow row, List<CaseStore.ItemRow> items) {
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
