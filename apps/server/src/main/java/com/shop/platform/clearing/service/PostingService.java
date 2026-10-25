package com.shop.platform.clearing.service;

import com.shop.platform.clearing.mapper.LedgerAccountMapper;
import com.shop.platform.clearing.mapper.SettlementMapper;
import com.shop.platform.clearing.model.MerchantShare;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 钱怎么走。四种动作，四种分录形状，全部经过 {@link Ledger}——没有第二条写分录的路径。
 *
 * <p><b>符号约定</b>：正数表示这个主体的余额增加。我们没有买家钱包，所以用
 * {@code channel}（代收账户）当外部对手方：它<b>为负表示平台净流入</b>，
 * 也就是"渠道那头欠平台的钱"。全链闭合时买家 -X、商家 +net、平台 +commission、channel 0。
 *
 * <p><b>佣金固定 5%（500bp）</b>，按商品款算，不含运费。费率模板归 {@code governance}，
 * 现在那张表还没建，所以先写死一个常量——写死也要写在一处，别散到三个 handler 里。
 */
@Component
public class PostingService {

    /** 佣金 500 基点 = 5%。按商品款算，运费不抽佣。 */
    public static final int COMMISSION_BP = 500;

    private static final int BP_BASE = 10_000;

    private final Ledger ledger;
    private final LedgerAccountMapper ledgerAccounts;
    private final SettlementMapper store;

    public PostingService(Ledger ledger, LedgerAccountMapper ledgerAccounts, SettlementMapper store) {
        this.ledger = Objects.requireNonNull(ledger, "ledger");
        this.ledgerAccounts = Objects.requireNonNull(ledgerAccounts, "ledgerAccounts");
        this.store = Objects.requireNonNull(store, "store");
    }

    public static long commissionOf(long goodsAmount) {
        return goodsAmount * COMMISSION_BP / BP_BASE;
    }

    /**
     * 支付成功：商家的钱进 {@code pending}，佣金进平台收入，钱从代收账户进来。
     *
     * <p>{@code biz_no} 用子单号，重复的 {@code OrderPaid} 撞唯一键，不会重复记账。
     */
    @Transactional
    public void recordPaid(UUID sellerOrderId, UUID merchantId, long goodsAmount, long payableAmount, String currency) {
        long commission = commissionOf(goodsAmount);
        long net = payableAmount - commission;

        store.insertItem(sellerOrderId, merchantId, currency, goodsAmount, payableAmount, commission, net);

        post(
                "order",
                "order:" + sellerOrderId + ":paid",
                currency,
                line(channel(currency), -payableAmount),
                line(pending(merchantId, currency), net),
                line(platformIncome(currency), commission));
    }

    /**
     * 确认收货：{@code pending} → {@code available}。
     *
     * <p>钱没多也没少，只是从"待结算"挪到"可提现"。false 表示这行已经解冻过，不重复记。
     */
    @Transactional
    public boolean release(UUID sellerOrderId, UUID merchantId, String currency, long net) {
        if (!store.release(sellerOrderId)) {
            return false;
        }
        post(
                "release",
                "order:" + sellerOrderId + ":release",
                currency,
                line(pending(merchantId, currency), -net),
                line(available(merchantId, currency), net));
        return true;
    }

    /**
     * 退款冲销：商家退商品款、平台退佣金、钱回到代收账户。
     *
     * <p>冲的是 {@code available} 而不是 {@code pending}：退款可能发生在结算前后，
     * 打 {@code available} 才能把已经结走的钱扣回来，余额变负就是商家欠平台，
     * 下一批结算自然抵扣。**负余额是正常状态**，不是异常。
     *
     * <p>商家与平台各承担多少，按该子单 {@code net : payableAmount} 的比例拆——
     * 只退商品款不退佣金，商家就白付了一次佣金。
     */
    @Transactional
    public void recordRefund(UUID refundId, UUID sellerOrderId, long amount, String currency, long frozenAmount) {
        SettlementMapper.ItemDetail item = store.findItem(sellerOrderId).orElse(null);

        // 商家承担的是**增量**：f(已退 + 本次) − f(已退)。逐次单独算会因截断而漂移，
        // 增量之和则永远精确等于 f(总退款)
        long merchantShare = item == null
                ? amount
                : MerchantShare.increment(item.refundedAmount(), amount, item.netAmount(), item.payableAmount());
        long platformShare = amount - merchantShare;

        // 累计仍按 payableAmount 口径记：这个数和 trade / payment 的退款额是同一个，换成净额口径就对不上了
        store.addRefunded(sellerOrderId, amount);

        // 冻着的钱从 held 走，没冻的从 available 走。两段都记，余额才对得上
        long fromFrozen = Math.min(frozenAmount, merchantShare);
        long fromAvailable = merchantShare - fromFrozen;
        UUID merchantId = merchantIdOf(sellerOrderId, item);

        post(
                "refund",
                "refund:" + refundId,
                currency,
                line(channel(currency), amount),
                line(held(merchantId, currency), -fromFrozen),
                line(available(merchantId, currency), -fromAvailable),
                line(platformIncome(currency), -platformShare));
    }

    /**
     * 售后占用：钱从 {@code pending}（或已解冻的 {@code available}）划到 {@code held}。
     *
     * <p>冻结不改商家总权益，只是把钱挪到"动不了"的格子里——没有这组分录，结算任务
     * 照样会把这笔钱打出去。
     */
    @Transactional
    public void hold(
            UUID caseId, UUID merchantId, String currency, long amount, String sourceAccountType, String bizNo) {
        UUID from =
                "available".equals(sourceAccountType) ? available(merchantId, currency) : pending(merchantId, currency);
        post("hold", bizNo, currency, line(from, -amount), line(held(merchantId, currency), amount));
    }

    /** 解冻：原路退回。 */
    @Transactional
    public void releaseHold(
            UUID caseId, UUID merchantId, String currency, long amount, String sourceAccountType, String bizNo) {
        UUID to =
                "available".equals(sourceAccountType) ? available(merchantId, currency) : pending(merchantId, currency);
        post("releaseHold", bizNo, currency, line(held(merchantId, currency), -amount), line(to, amount));
    }

    /**
     * 打款：商家的钱从 {@code available} 出去，回到代收账户（钱真的离开平台了）。
     *
     * <p>{@code success} 由渠道回执决定，这里只在拿到回执之后才记账。
     */
    @Transactional
    public void recordPayout(String payoutNo, UUID merchantId, long amount, String currency) {
        post(
                "payout",
                "payout:" + payoutNo,
                currency,
                line(available(merchantId, currency), -amount),
                line(channel(currency), amount));
    }

    // ── 账户与分录 ────────────────────────────────────────────────────────

    private UUID pending(UUID merchantId, String currency) {
        return ledgerAccounts.ensure("merchant", merchantId, "pending", currency);
    }

    private UUID available(UUID merchantId, String currency) {
        return ledgerAccounts.ensure("merchant", merchantId, "available", currency);
    }

    private UUID held(UUID merchantId, String currency) {
        return ledgerAccounts.ensure("merchant", merchantId, "held", currency);
    }

    private UUID platformIncome(String currency) {
        return ledgerAccounts.ensure("platform", LedgerAccountMapper.PLATFORM_OWNER, "available", currency);
    }

    private UUID channel(String currency) {
        return ledgerAccounts.ensure("channel", LedgerAccountMapper.PLATFORM_OWNER, "available", currency);
    }

    private static UUID merchantIdOf(UUID sellerOrderId, SettlementMapper.ItemDetail item) {
        if (item == null) {
            throw new IllegalStateException("退款找不到待结算明细: " + sellerOrderId);
        }
        return item.merchantId();
    }

    /** 金额为 0 的分录不落库（{@code ck_ledger_entry_amount} 也不允许），整组为空就跳过。 */
    private void post(String bizType, String bizNo, String currency, Ledger.Line... lines) {
        List<Ledger.Line> kept = new ArrayList<>(lines.length);
        for (Ledger.Line line : lines) {
            if (line != null) {
                kept.add(line);
            }
        }
        if (kept.isEmpty()) {
            return;
        }
        ledger.post(bizType, bizNo, currency, kept);
    }

    /**
     * 金额为 0 返回 {@code null}，由 {@link #post} 过滤掉。
     *
     * <p>不能返回一个 0 金额的 {@code Line}——那个构造器本身就拒绝 0，
     * 而参数在进方法之前就求值了，过滤发生在它后面已经晚了。
     */
    private static Ledger.Line line(UUID accountId, long amount) {
        return amount == 0 ? null : new Ledger.Line(accountId, amount);
    }
}
