package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.common.Validate;
import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface OrderMapper extends BaseMapper<Order> {

    /**
     * 取本人订单：买家侧一切动作与查询的同一道门。不存在与不属于本人给同一句话，
     * 不泄露单据存在性。收在这里而非各 service 各写一份——「越权说什么」只该定义一处。
     *
     * <p>注意现状：不存在走 {@link Validate#notNull} 给 404，归属不符走 {@link Validate#isTrue} 给 400，
     * 状态码并不一致（文案一致）。与 CheckoutResolver 的地址归属判定同源，见 CheckoutResolverTest 的说明。
     */
    default Order requireOwned(UUID userId, UUID orderId) {
        Order order = Validate.notNull(selectById(orderId), "订单不存在");
        Validate.isTrue(order.getUserId().equals(userId), "订单不存在");
        return order;
    }

    /** 取本店订单：卖家侧同一道门，越店与不存在同样不区分 */
    default Order requireShopOwned(UUID shopId, UUID orderId) {
        Order order = Validate.notNull(selectById(orderId), "订单不存在");
        Validate.isTrue(order.getShopId().equals(shopId), "订单不存在");
        return order;
    }

    /** 同一次结算已落的全部订单（幂等重放回读）；按 shopId 升序，与 OrderService.create 的拆单顺序一致 */
    default List<Order> selectByCheckoutKey(UUID userId, UUID checkoutKey) {
        return selectList(new LambdaQueryWrapper<Order>()
                .eq(Order::getUserId, userId)
                .eq(Order::getCheckoutKey, checkoutKey)
                .orderByAsc(Order::getShopId));
    }

    /**
     * 取消订单的条件转移：限定调用方给出的合法源状态集（买家取消给 {@link OrderStatus#sourcesOf} 的全集，
     * 系统超时各只认自己那一态），成功时经 PG18 RETURNING OLD 带回<b>转移前</b>的状态——
     * 付款前后取消的库存回退分流据此判定，不再依赖 CAS 前的陈旧读。
     * 无行返回 = 抢不到转移（已发货/已完成/已关闭），调用方给 409 或让位。
     *
     * <p>声明为 @Select 是消费 RETURNING 结果集的既定姿势（走 executeQuery 而非 executeUpdate）；
     * 出入参都是枚举，与 status 列的 varchar 由默认 EnumTypeHandler 对译，避免字符串与枚举混比。
     */
    @Select(
            """
            <script>
            UPDATE orders.orders
            SET status = 'CANCELLED', cancelled_at = #{cancelledAt}, cancel_reason = #{reason}
            WHERE id = #{orderId}
              AND status IN
              <foreach collection="sources" item="source" open="(" separator=", " close=")">#{source}</foreach>
            RETURNING OLD.status AS "previousStatus"
            </script>
            """)
    OrderStatus cancelReturningPrevious(
            @Param("orderId") UUID orderId,
            @Param("sources") Collection<OrderStatus> sources,
            @Param("cancelledAt") OffsetDateTime cancelledAt,
            @Param("reason") String reason);
}
