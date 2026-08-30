package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface OrderMapper extends BaseMapper<Order> {

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
