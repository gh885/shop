package com.shop.platform.clearing.service;

import com.shop.platform.clearing.mapper.SettlementStore;
import com.shop.platform.clearing.model.MerchantShare;
import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 结算到打款。
 *
 * <p>T+7：确认收货后还要压 7 天。**理由不是平台想占款**——退款发生在确认收货之后，
 * 当天打给商家的话，退款就得回头向商家要钱，商家没钱就变成平台垫资。7 天是拿时间换缓冲。
 *
 * <p>净额 = Σ(子单净额) − Σ(已冲销)。净额 ≤ 0 不生成批次：那是商家欠平台，
 * 留着让下一批抵扣，不能生成一张负数打款单。
 *
 * <p>打款渠道现在是 mock：记账照记，钱不出门。真接渠道时只换 {@code channel} 与回执来源，
 * 账本这一段不用动。
 *
 * <p><b>事务边界 = 一个商家。</b> 外层只枚举候选商家（无事务），每家进自己的事务——
 * 一个商家的账算不清只回滚它自己，其余商家照常结。互斥靠认领：{@code dueItems}
 * 带 {@code FOR UPDATE SKIP LOCKED}，行锁持到本商家事务提交，别的实例会跳过这些行。
 */
@Service
public class SettlementService {

    private static final Logger log = LoggerFactory.getLogger(SettlementService.class);

    private static final String CHANNEL = "mock";

    private final SettlementStore store;
    private final PostingService posting;
    private final Duration hold;

    public SettlementService(
            SettlementStore store, PostingService posting, @Value("${shop.clearing.hold:PT168H}") Duration hold) {
        this.store = Objects.requireNonNull(store, "store");
        this.posting = Objects.requireNonNull(posting, "posting");
        this.hold = Objects.requireNonNull(hold, "hold");
    }

    /** 枚举有账可结的商家。不带事务：真正的互斥在每家事务内的认领上。 */
    public List<SettlementStore.MerchantDue> dueMerchants(Instant now) {
        return store.dueMerchants(now.minus(hold));
    }

    /**
     * 结算一个商家的全部到期明细，成功生成并打款一个批次。
     *
     * @return false = 没有可结明细（被别的实例认领走了）或净额非正
     */
    @Transactional
    public boolean settleMerchant(UUID merchantId, String currency, Instant now) {
        Instant before = now.minus(hold);

        // 认领：SELECT 即加行锁，本事务内这些行不可能再被别人圈走
        List<SettlementStore.ItemRow> items = store.dueItems(merchantId, currency, before);
        if (items.isEmpty()) {
            return false;
        }

        long gross =
                items.stream().mapToLong(SettlementStore.ItemRow::netAmount).sum();
        // 退款额按**商家承担**口径汇总：gross 是商家净额，减的也必须是商家净额，
        // 直接减买家退款全额会把佣金那部分也算到商家头上
        long refund = items.stream()
                .mapToLong(item -> MerchantShare.of(item.refundedAmount(), item.netAmount(), item.payableAmount()))
                .sum();
        long net = gross - refund;
        if (net <= 0) {
            // 商家欠平台：不出负数打款单，留着下一批抵扣
            log.info("结算净额非正，跳过：merchant={} net={}", merchantId, net);
            return false;
        }

        UUID batchId = Ids.newId();
        String batchNo = BizNo.of("SB", LocalDate.now());
        store.insertBatch(
                batchId,
                batchNo,
                merchantId,
                currency,
                items.size(),
                gross,
                refund,
                net,
                LocalDate.now().minusDays(hold.toDays()),
                LocalDate.now());

        String payoutNo = BizNo.of("PY", LocalDate.now());
        UUID payoutId = Ids.newId();
        store.insertPayout(payoutId, payoutNo, batchId, merchantId, net, currency, CHANNEL);

        // mock 回执：立刻成功。真渠道这里要等异步回调，成功之前不记账
        store.markPayoutSuccess(payoutId, "MOCK-PAYOUT-" + payoutNo);
        posting.recordPayout(payoutNo, merchantId, net, currency);
        store.markBatchPaid(batchId);
        store.settleItems(
                batchId,
                items.stream().map(SettlementStore.ItemRow::sellerOrderId).toList());

        log.info("结算完成：merchant={} batch={} net={} 分", merchantId, batchNo, net);
        return true;
    }
}
