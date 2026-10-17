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
}
