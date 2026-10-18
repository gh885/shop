package com.shop.platform.aftersale.model;

import java.time.Duration;

/**
 * 售后时间窗口的唯一出处（C11，卖家确认收货窗口补自 AFS-23 的留白）。与订单侧 {@code OrderTimeouts} 同一理由：
 * 天数散写在扫描器、文档与前端提示里必然漂移，集中一处。
 *
 * <p>前三条是「到期有定时器接手」的超时窗口；{@link #NO_REASON} 不是——它是买家的法定资格窗口，
 * 到期不触发任何动作，只是不再强制卖家接受退货。放同一处是因为它们都是「几天」这个唯一真相。
 */
public final class AfterSaleTimeouts {

    /**
     * APPLYING 起算（= 售后单 created_at）：卖家审核窗口，到期<b>自动同意</b>（超时算卖家默认放行，
     * 买家不该为卖家的沉默等待）。48h 是「两天工作日」的直觉值，够卖家看到待办、又不至于买家悬着。
     */
    public static final Duration SELLER_RESPONSE = Duration.ofHours(48);

    /**
     * RETURNING 起算（= 同意动作落时间线的时刻）：买家回寄窗口，到期仍<b>没填过回寄运单号</b>即视为
     * 放弃，售后单自动关闭（CLOSED）——释放「一单一进行中」名额，窗口内还能重新申请。
     * 7 天与订单侧确认收货窗口同量级：填了单号的单不归本条管（货已在途，等卖家收货）。
     */
    public static final Duration BUYER_RETURN = Duration.ofDays(7);

    /**
     * 买家回寄起算（= 最近一次 RETURN_GOODS 事件时刻）：卖家<b>确认收货</b>窗口，到期即自动退款并回补
     * （{@code RefundService.autoReceiveReturn}）。买家寄出后快递在途约 2～3 天，剩下给卖家验货——
     * 比正向确认收货（{@code OrderTimeouts} 7 天）长，因为延误的代价在买家身上：货已经不在他手里了。
     * 没有这条超时，卖家只要不点确认收货就能把「已同意退货」悬成无限期（订单也因争议未决不自动完成）。
     */
    public static final Duration SELLER_RECEIVE = Duration.ofDays(10);

    /**
     * 签收起算（未签收而买家已确认收货则按完成时刻，见 {@code OrderAfterSaleView#receivedAt}）：
     * 七天无理由退货的<b>资格</b>窗口（消保法第 25 条「自收到商品之日起七日内」）。到期没有任何定时器动作——
     * 变的只是这张单子的性质：窗口内以「无理由」申请的退货退款，卖家不得拒绝（AFS-45）；窗口外照旧可申请，
     * 但走的是普通售后，卖家有权拒绝。
     */
    public static final Duration NO_REASON = Duration.ofDays(7);

    private AfterSaleTimeouts() {}
}
