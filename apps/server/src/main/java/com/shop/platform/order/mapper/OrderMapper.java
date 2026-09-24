package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
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
     * 取本人订单：买家侧一切动作与查询的同一道门。不存在与不属于本人给同一句话、同一个状态码（404），
     * 不泄露单据存在性。收在这里而非各 service 各写一份——「越权说什么」只该定义一处。
     *
     * <p>归属不符也走 404：400 会说「请求本身有问题」，而事实是「这个资源对你不存在」；
     * 与 AfterSale/ShipmentService 的同一个门的口径保持一致（曾因 isTrue 默认 400 而不一致）。
     */
    default Order requireOwned(UUID userId, UUID orderId) {
        return Validate.requireOwned(selectById(orderId), Order::getUserId, userId, "订单不存在");
    }

    /** 取本店订单：卖家侧同一道门，越店与不存在同样不区分（同为 404） */
    default Order requireShopOwned(UUID shopId, UUID orderId) {
        return Validate.requireOwned(selectById(orderId), Order::getShopId, shopId, "订单不存在");
    }

    /**
     * 发货的条件转移：本店 + 可发货状态（PAID 首次发货 / SHIPPED 追加包裹，含已取消与已完成），
     * 成功时经 PG18 RETURNING OLD 带回<b>转移前</b>的状态——前态决定要不要落审计流水：
     * PAID → SHIPPED 是一次状态转移，SHIPPED → SHIPPED 只是同一订单的又一个包裹。
     * 无行返回 = 抢不到（非本店 / 已取消 / 已完成 / 不存在），调用方给 404 或 409。
     *
     * <p>shipped_at 与 receive_expire_at 用 COALESCE 只回填一次：订单的发货时刻与收货窗口属于<b>首次</b>发货，
     * 追加包裹不得把它们往后推。logistics_company / tracking_no 则每次刷新为最新包裹（订单详情的物流摘要口径）。
     */
    @Select(
            """
            UPDATE orders.orders
            SET status = 'SHIPPED',
                shipped_at = COALESCE(shipped_at, #{shippedAt}),
                receive_expire_at = COALESCE(receive_expire_at, #{receiveExpireAt}),
                logistics_company = #{carrierName},
                tracking_no = #{trackingNo}
            WHERE id = #{orderId}
              AND shop_id = #{shopId}
              AND status IN ('PAID', 'SHIPPED')
            RETURNING OLD.status AS "previousStatus"
            """)
    OrderStatus markShippedReturningPrevious(
            @Param("orderId") UUID orderId,
            @Param("shopId") UUID shopId,
            @Param("carrierName") String carrierName,
            @Param("trackingNo") String trackingNo,
            @Param("shippedAt") OffsetDateTime shippedAt,
            @Param("receiveExpireAt") OffsetDateTime receiveExpireAt);

    /**
     * 签收事实落库（物流模块推进到已签收时经 order :: api 调用）：只写投影列 + 把收货窗口从签收起重算。
     * 限定 SHIPPED 且 delivered_at 为空——重复签收幂等无副作用，已取消/已完成的单不会被物流回写改动。
     */
    default int markDelivered(UUID orderId, OffsetDateTime deliveredAt, OffsetDateTime receiveExpireAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .eq(Order::getStatus, OrderStatus.SHIPPED)
                        .isNull(Order::getDeliveredAt)
                        .set(Order::getDeliveredAt, deliveredAt)
                        .set(Order::getReceiveExpireAt, receiveExpireAt));
    }

    /**
     * 包裹退回事实落库（物流模块推进到退回时经 order :: api 调用）：只把收货窗口从退回时刻重算，不写签收投影。
     * 限定 SHIPPED 且 delivered_at 为空——只要有任何一件签收过，签收就是「买家拿到货」的更权威事实，不再被退回改动；
     * 已完成/已取消的单同样不命中（幂等无副作用）。
     */
    default int markReturned(UUID orderId, OffsetDateTime receiveExpireAt) {
        return update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, orderId)
                        .eq(Order::getStatus, OrderStatus.SHIPPED)
                        .isNull(Order::getDeliveredAt)
                        .set(Order::getReceiveExpireAt, receiveExpireAt));
    }

    /** 同一次结算已落的全部订单（幂等重放回读）；按 shopId 升序，与 OrderService.create 的拆单顺序一致 */
    default List<Order> selectByCheckoutKey(UUID userId, UUID checkoutKey) {
        return selectList(new LambdaQueryWrapper<Order>()
                .eq(Order::getUserId, userId)
                .eq(Order::getCheckoutKey, checkoutKey)
                .orderByAsc(Order::getShopId));
    }

    /** 恶拍闸门①：买家当前在途的待付款单数（走 idx_orders_user_created 的 user_id 前缀） */
    default long countPendingPayment(UUID userId) {
        return selectCount(new LambdaQueryWrapper<Order>()
                .eq(Order::getUserId, userId)
                .eq(Order::getStatus, OrderStatus.PENDING_PAYMENT));
    }

    /**
     * 恶拍闸门②：窗口内「拍下不付即关闭」的单数。paid_at 为空是判据——已付款后取消（含 3 天未发货的
     * 系统关单）与「拍下不付」是两回事，不该算进恶意次数。
     */
    default long countUnpaidCancelledSince(UUID userId, OffsetDateTime since) {
        return selectCount(new LambdaQueryWrapper<Order>()
                .eq(Order::getUserId, userId)
                .eq(Order::getStatus, OrderStatus.CANCELLED)
                .isNull(Order::getPaidAt)
                .ge(Order::getCancelledAt, since));
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
