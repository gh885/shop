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

    /**
     * 跑一轮结算。
     *
     * @return 生成并打款成功的批次数
     */
    @Transactional
    public int settle(Instant now) {
        Instant before = now.minus(hold);
        int settled = 0;

        for (SettlementStore.MerchantDue due : store.dueMerchants(before)) {
            List<SettlementStore.ItemRow> items = store.dueItems(due.merchantId(), due.currency(), before);
            if (items.isEmpty()) {
                continue;
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
                log.info("结算净额非正，跳过：merchant={} net={}", due.merchantId(), net);
                continue;
            }

            UUID batchId = Ids.newId();
            String batchNo = BizNo.of("SB", LocalDate.now());
            store.insertBatch(
                    batchId,
                    batchNo,
                    due.merchantId(),
                    due.currency(),
                    items.size(),
                    gross,
                    refund,
                    net,
                    LocalDate.now().minus(hold),
                    LocalDate.now());

            String payoutNo = BizNo.of("PY", LocalDate.now());
            UUID payoutId = Ids.newId();
            store.insertPayout(payoutId, payoutNo, batchId, due.merchantId(), net, due.currency(), CHANNEL);

            // mock 回执：立刻成功。真渠道这里要等异步回调，成功之前不记账
            store.markPayoutSuccess(payoutId, "MOCK-PAYOUT-" + payoutNo);
            posting.recordPayout(payoutNo, due.merchantId(), net, due.currency());
            store.markBatchPaid(batchId);
            store.settleItems(batchId, due.merchantId(), due.currency(), before);

            settled++;
            log.info("结算完成：merchant={} batch={} net={} 分", due.merchantId(), batchNo, net);
        }
        return settled;
    }
}
