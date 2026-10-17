package com.shop.platform.order.service;

import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.order.mapper.Trade;
import com.shop.platform.order.mapper.TradeMapper;
import com.shop.platform.order.service.OrderService.CreatedTrade;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

/**
 * 下单的幂等入口（非事务）：包住 {@link OrderService#create} 的事务，撞 checkoutKey 唯一键时回读原单返回。
 *
 * <p>为何独立成 bean：PG 撞唯一索引即把整个事务标为 aborted，catch 必须发生在事务边界之外；
 * 而 OrderService 内部自调用会绕过 @Transactional 代理。
 *
 * <p>并发双击的时序：第二个事务在主订单 insert 处阻塞等第一个提交，然后撞键——库存冻结执行不到第二次；
 * 首次尝试因缺货回滚时什么都没落库，同一个 key 可以再用。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderPlacementService {

    private final OrderService orderService;

    private final TradeMapper tradeMapper;

    private final OrderMapper orderMapper;

    public CreatedTrade place(UUID userId, CreateOrderRequest req) {
        try {
            return orderService.create(userId, req);
        } catch (DuplicateKeyException e) {
            // 撞的可能是 uk_trades_trade_no（最后防线）而非 checkout 键：回读为空即原样上抛
            Trade existing = tradeMapper.selectByCheckoutKey(userId, req.checkoutKey());
            if (existing == null) {
                throw e;
            }
            var orders = orderMapper.selectByTradeId(existing.getId());
            log.info(
                    "[ORDER] 重复提交回放原主订单, userId={}, checkoutKey={}, 子订单数={}", userId, req.checkoutKey(), orders.size());
            return new CreatedTrade(existing, orders);
        }
    }
}
