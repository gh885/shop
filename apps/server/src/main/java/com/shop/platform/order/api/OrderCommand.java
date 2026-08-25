package com.shop.platform.order.api;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 订单命令（跨模块消费）：payment 模块支付成功后在写流水的事务内同步调用。
 * 条件转移失败抛 409 连带支付流水一起回滚——资金状态两侧原子。
 * 支付成功同时扣实冻结库存（inventory :: StockCommand.capture，同事务），冻结在下的才可支付。
 */
@Component
@RequiredArgsConstructor
public class OrderCommand {

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final StockCommand stockCommand;

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

        // 支付成功即扣实冻结库存（同事务）：货真的没了，冻结量归还
        List<StockLine> lines =
                orderItemMapper
                        .selectList(new LambdaQueryWrapper<OrderItem>().eq(OrderItem::getOrderId, orderId))
                        .stream()
                        .map(i -> new StockLine(i.getSkuId(), i.getQuantity()))
                        .toList();
        stockCommand.capture(orderId, lines);
    }
}
