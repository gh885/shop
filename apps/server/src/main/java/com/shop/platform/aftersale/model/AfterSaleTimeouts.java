package com.shop.platform.aftersale.model;

import java.time.Duration;

/**
 * 售后两个超时窗口的唯一出处（C11）。与订单侧 {@code OrderTimeouts} 同一理由：天数散写在扫描器、
 * 文档与前端提示里必然漂移，集中一处。
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

    private AfterSaleTimeouts() {}
}
