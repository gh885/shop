package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 买家主进度 —— 主订单级的展示态，不是存储态（docs/domain/order-model.md §5.3）。
 *
 * <p>「买家现在该等什么」这件事横跨两层：支付生死在主订单，货走到哪在子订单。把两者压成一条线给买家看，
 * 这条线就是主进度。它<b>不落表</b>：{@code orders.trade_progress} 视图按当前事实算（V84），
 * 列表筛选与详情展示都读那份算法，Java 侧只持有词表与文案。
 *
 * <p>与 {@link OrderStatus} 的关系：主进度是<b>投影</b>，子订单状态是<b>事实</b>。子订单取消后退出主进度判断
 * （活跃 = {@code status <> CANCELLED}），只在售后角标里体现；因此主进度可能比单张子订单更「靠前」——
 * 一单完成、一单待发货，主进度是「部分发货」而不是「待收货」。
 *
 * <p>算法落在视图而不是这里，是为了避免「Java 一份 + SQL 一份」两处各推：
 * 列表要按主进度分页筛选，筛选必须在库里做，于是唯一实现留在库里。
 */
@Schema(enumAsRef = true)
public enum MainProgress {

    /** 主订单待支付（规则 0）：未付款，履约还没开始 */
    PENDING_PAYMENT,

    /** 待发货（规则 3）：活跃子订单一行都没结清 */
    PENDING_SHIPMENT,

    /** 部分发货（规则 4）：还有活跃子订单没结清——发起中的退款不算，只认已成功落账的 */
    PARTIALLY_SHIPPED,

    /** 待收货（规则 5）：全部活跃子订单已结清，但还没全部完成 */
    PENDING_RECEIPT,

    /** 已完成（规则 6）：全部活跃子订单都已完成 */
    COMPLETED,

    /** 已关闭（规则 1 / 2）：主订单已关，或子订单全部已取消 */
    CLOSED;
}
