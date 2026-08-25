package com.shop.platform.order.api;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.common.Validate;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderMapper;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 订单命令（跨模块消费）：payment 模块支付成功后在写流水的事务内同步调用。
 * 条件转移失败抛 409 连带支付流水一起回滚——资金状态两侧原子。
 */
@Component
@RequiredArgsConstructor
public class OrderCommand {

    private final OrderMapper orderMapper;

    /** 支付成功的落点：条件转移 PENDING_PAYMENT → PAID；失败抛 409 令调用方事务回滚 */
    public void markPaid(UUID orderId) {
        int affected = orderMapper.update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .in(Order::getStatus, Order.sourcesOf(Order.STATUS_PAID))
                        .set(Order::getStatus, Order.STATUS_PAID)
                        .set(Order::getPaidAt, OffsetDateTime.now()));
        Validate.isTrue(affected == 1, 409, "订单已取消或已支付，本次支付未生效");
    }
}
