package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import java.util.List;
import java.util.UUID;

/**
 * 一次退款成功后要落进订单账本的全部事实（aftersale → order，同事务）。
 *
 * <p>为什么整包传而不是让 aftersale 自己更新 orders 表：行账本、订单汇总、主订单汇总、履约重算与关单
 * 都在 order 模块里，跨模块只认 api 命令（apps/server/AGENTS.md 的模块隔离）。打包成一条命令也保证
 * 「行数量、行金额、订单已退、主订单已退」要么一起成立、要么一起回滚——拆成多次调用就有半成品窗口。
 *
 * @param orderBadge 退款成功后的订单角标（§5.4，由 aftersale 按该订单的全部退款单算出）
 * @param tradeBadge 主订单角标（同上，按整张主订单的退款单算）
 * @param facts      发货事实：退款改变结清量后，履约态重算要用的三个结论（logistics 提供）
 */
public record RefundSettlement(
        UUID orderId,
        UUID tradeId,
        /** 商品行：只装 item 型退款行（运费与补偿不占行数量） */
        List<RefundItemSettlement> items,
        /** 本次计入 {@code refunded_amount} 的总额 = 商品行金额 + 运费行金额（没有运费行时 = 商品行之和） */
        Money refundedTotal,
        /** 本次计入 {@code compensated_amount} 的补偿额；没有补偿行为 0 */
        Money compensation,
        /** true = 退货退款：数量从有效发货量扣回；false = 仅退款：只累加已退 */
        boolean reclaimShipped,
        AfterSaleBadge orderBadge,
        AfterSaleBadge tradeBadge,
        OrderFulfillmentFacts facts) {

    /** 一条商品退款行：哪个订单行、退几件、退多少钱 */
    public record RefundItemSettlement(UUID orderItemId, int quantity, Money amount) {}
}
