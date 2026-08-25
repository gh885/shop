package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
}
