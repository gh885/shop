package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OrderItemMapper extends BaseMapper<OrderItem> {

    /** 单笔订单全部条目：详情展示、支付扣库存、关单释放共用 */
    default List<OrderItem> selectByOrderId(UUID orderId) {
        return selectList(new LambdaQueryWrapper<OrderItem>().eq(OrderItem::getOrderId, orderId));
    }

    /** 多订单条目批查：列表页拼行项目免 N+1（调用方自行分组） */
    default List<OrderItem> selectByOrderIds(Collection<UUID> orderIds) {
        return selectList(new LambdaQueryWrapper<OrderItem>().in(OrderItem::getOrderId, orderIds));
    }

    /**
     * 发货守卫 + 入账（一条语句完成，禁止先读后写）：{@code settled_quantity + 本次 ≤ quantity}
     * 不成立即 0 行，调用方给 409 并回滚整张发货单。
     *
     * <p>两个分量同增：发出的货同时计入有效发货量与结清量（§4.3 / INV-11）。语句里不带 {@code quantity}
     * 的绝对值，是因为并发下唯一可信的比较基准就是行上的当前值。
     */
    default int increaseShipped(UUID orderId, UUID orderItemId, int quantity) {
        return update(
                null,
                new LambdaUpdateWrapper<OrderItem>()
                        .eq(OrderItem::getId, orderItemId)
                        .eq(OrderItem::getOrderId, orderId)
                        .apply("settled_quantity + {0} <= quantity", quantity)
                        .setSql("shipped_quantity = shipped_quantity + " + quantity
                                + ", settled_quantity = settled_quantity + " + quantity));
    }

    /**
     * 取消已发出的包裹：把有效发货量退回未发件（§8「取消已发出单：回退该行有效发货量」）。
     * 两个分量同减；0 行说明账本已被别的路径改过，调用方给 409——账对不上比失败更糟。
     */
    default int decreaseShipped(UUID orderId, UUID orderItemId, int quantity) {
        return update(
                null,
                new LambdaUpdateWrapper<OrderItem>()
                        .eq(OrderItem::getId, orderItemId)
                        .eq(OrderItem::getOrderId, orderId)
                        .apply("shipped_quantity >= {0}", quantity)
                        .setSql("shipped_quantity = shipped_quantity - " + quantity
                                + ", settled_quantity = settled_quantity - " + quantity));
    }

    /**
     * 仅退款成功入账（§8 退款数量处理）：退的是<b>还没发出去的货</b>，因此只动「已退 + 结清」两列，
     * 有效发货量不动。闸门 {@code settled_quantity + 本次 ≤ quantity} 与金额上限在同一条语句里重跑：
     * 并发下唯一可信的比较基准是行上的当前值，先读后写会放过两笔同时通过的退款。
     *
     * <p>0 行 = 退款数量或金额超过该行额度，调用方 409 并回滚整张退款单。
     */
    default int increaseRefundedOnly(UUID orderId, UUID orderItemId, int quantity, long amount) {
        return update(
                null,
                new LambdaUpdateWrapper<OrderItem>()
                        .eq(OrderItem::getId, orderItemId)
                        .eq(OrderItem::getOrderId, orderId)
                        .apply("settled_quantity + {0} <= quantity", quantity)
                        .apply("refunded_amount + {0} <= goods_paid_amount", amount)
                        .setSql("refunded_quantity = refunded_quantity + " + quantity
                                + ", settled_quantity = settled_quantity + " + quantity
                                + ", refunded_amount = refunded_amount + " + amount));
    }

    /**
     * 退货退款成功入账（§8）：退的是<b>已发出、已寄回</b>的货，数量从有效发货量里扣回、同量计入已退，
     * 因此结清量不变（消费了「发出去」那部分义务，转成「退掉」那部分）。
     *
     * <p>闸门 {@code shipped_quantity >= 本次}：寄回的量不能超过当前有效发货量——取消包裹后的货没有寄出过，
     * 不能被当成退货退款扣一次。
     */
    default int increaseReturnRefunded(UUID orderId, UUID orderItemId, int quantity, long amount) {
        return update(
                null,
                new LambdaUpdateWrapper<OrderItem>()
                        .eq(OrderItem::getId, orderItemId)
                        .eq(OrderItem::getOrderId, orderId)
                        .apply("shipped_quantity >= {0}", quantity)
                        .apply("refunded_quantity + {0} <= quantity", quantity)
                        .apply("refunded_amount + {0} <= goods_paid_amount", amount)
                        .setSql("shipped_quantity = shipped_quantity - " + quantity
                                + ", refunded_quantity = refunded_quantity + " + quantity
                                + ", refunded_amount = refunded_amount + " + amount));
    }
}
