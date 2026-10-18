package com.shop.platform.order.api;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 订单 / 主订单上的售后角标（docs/domain/order-model.md §5.4）—— 与主进度正交的第二条线，叠加展示。
 *
 * <p>它不是退款单状态，而是一段钱的展示结论：有没有正在处理的退款（{@link #REFUNDING}）、
 * 有没有真退出去的商品/运费款（{@link #REFUNDED}）、还是只做过补偿（{@link #COMPENSATED}）。
 * 结算口径（按优先级命中第一个）：
 * <ol>
 *   <li>存在未完结退款单（含重试期内的失败单）⇒ 退款中；</li>
 *   <li>否则存在成功的 item / shipping 行 ⇒ 已退款；</li>
 *   <li>否则存在成功的 compensation 行 ⇒ 已补偿；</li>
 *   <li>都没有 ⇒ 无角标。</li>
 * </ol>
 * 「已退款」优先于「已补偿」：两者皆有时先让买家看到钱的去向。
 *
 * <p>本枚举归 order 模块（展示方持有投影列），真相在 aftersale 的退款单；aftersale 每次退款状态变化后
 * 经 {@code OrderCommand.syncAfterSaleBadge} 写回，order 不反向读退款表——否则与 aftersale → order :: api
 * 的依赖方向成环。DB 列存 {@code name()}。
 */
@Schema(enumAsRef = true)
public enum AfterSaleBadge {

    /** 无售后角标：没有退款单，或全部为未出钱的终态（已拒绝 / 已撤销 / 重试已耗尽的失败） */
    NONE,

    /** 退款中：存在未完结退款单（含补偿型与重试期内的失败单） */
    REFUNDING,

    /** 已退款：无未完结退款单，且存在成功的 item / shipping 退款行 */
    REFUNDED,

    /** 已补偿：无未完结退款单、无成功的 item / shipping 行，但存在成功的补偿行 */
    COMPENSATED;

    /** 争议未决：还有退款在跑。系统不替买家宣布「已收货」，自动收货让位给它（AFS-43） */
    public boolean refunding() {
        return this == REFUNDING;
    }
}
