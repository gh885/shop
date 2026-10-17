package com.shop.platform.order.service;

import com.shop.platform.common.Sweep;
import com.shop.platform.order.mapper.Trade;
import com.shop.platform.order.mapper.TradeMapper;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 主订单支付超时扫描：扫到期未支付的主订单，逐笔交给 {@link OrderTransitionService#closeUnpaidTrade}
 * 关单并级联取消子订单。
 *
 * <p>与订单侧扫描同一套口径：部分索引装全集、按截止升序取头部、逐笔 {@link Sweep#each} 隔离失败。
 * 并发正确性不依赖锁——关单是条件更新，抢不到的那一方返回 false 让位。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class TradeTimeoutService {

    /** 单批上限：部分索引全集有限，分批跑防长事务 */
    private static final int BATCH_LIMIT = 100;

    private final TradeMapper tradeMapper;

    private final OrderTransitionService transitions;

    /** 扫一轮支付超时，返回真正关掉的主订单数 */
    public int sweep() {
        List<Trade> expired = tradeMapper.selectExpiredPay(OffsetDateTime.now(), BATCH_LIMIT);
        return Sweep.each(log, "超时未支付关单", expired, Trade::getId, transitions::closeUnpaidTrade);
    }
}
