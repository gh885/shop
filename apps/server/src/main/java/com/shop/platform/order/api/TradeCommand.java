package com.shop.platform.order.api;

import com.shop.platform.order.mapper.TradeMapper;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 主订单命令（跨模块消费）：payment 在确认完流水后推进主订单。
 *
 * <p>「全部子订单 paid_at 非空」是推进条件，写在 {@link TradeMapper#markPaidIfComplete} 的 WHERE 里：
 * 多店结算的某一张子订单还没确认时，主订单留在待支付，等最后一张确认再落 PAID。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class TradeCommand {

    private final TradeMapper tradeMapper;

    /**
     * 尝试推进主订单：全部子订单已支付才落 PAID 并回填 paid_at / paid_amount。
     *
     * @return 是否真的推进；0 行不是错误——只付了部分子订单时就该留在待支付
     */
    public boolean markPaidIfComplete(UUID tradeId) {
        boolean advanced = tradeMapper.markPaidIfComplete(tradeId, OffsetDateTime.now()) == 1;
        if (advanced) {
            log.info("[TRADE] 主订单支付完成, tradeId={}", tradeId);
        }
        return advanced;
    }
}
