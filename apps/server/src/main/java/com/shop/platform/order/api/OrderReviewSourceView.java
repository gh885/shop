package com.shop.platform.order.api;

import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 订单的「评价素材」投影（review 模块消费）：归属买家、店铺、状态、完成时刻与逐行商品快照。
 *
 * <p>只带评价要用的东西：能不能评（状态与完成时刻）、是谁的（userId）、算给谁（shopId）、评什么（行快照）。
 * 评价窗口本身（完成 + N 天）是 review 域的规则，不在这里算——窗口归 owning 模块，
 * order 只给「什么时候完成的」这个事实。金额同样不在其中：评价不是对账凭据，复制一份金额就多一个会漂移的口径。
 */
public record OrderReviewSourceView(
        UUID orderId,
        UUID userId,
        UUID shopId,
        String orderNo,
        OrderStatus status,
        /** 完成时刻（确认收货 / 超时自动收货）；未完成时为 null */
        OffsetDateTime completedAt,
        List<ReviewSourceLine> lines) {

    /**
     * 订单是否已完成（确认收货 / 超时自动收货）：消费方（review）据此判「可评价」，
     * 状态词表留在本模块——别的模块不认识 {@code OrderStatus} 枚举，跨模块只拿这个谓词。
     */
    public boolean completed() {
        return status == OrderStatus.COMPLETED;
    }

    /**
     * 逐行素材：订单行 id（评价行引用它）、商品与 SKU 标识、名称与图片快照。
     *
     * <p>名称/图是下单那一刻的快照：商品后来改名、下架，评价展示不变（REV-05）。
     */
    public record ReviewSourceLine(UUID orderItemId, UUID productId, UUID skuId, String name, String image) {}
}
