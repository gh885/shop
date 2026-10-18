package com.shop.platform.aftersale.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * 退款单的可执行动作 —— 状态机出边 ∩ 当前视角，也是售后按钮组的唯一真相（随契约下发，前端不重复推导）。
 *
 * <p>与 {@link RefundStatus#TRANSITIONS} 的关系：那张表说「哪些状态能到哪些状态」，本枚举说「界面上给哪个按钮」。
 * 一个按钮可能对应两条边（买家的「撤销」在待处理与待寄回都可用），卖家侧则刻意把正常推进放在破坏性动作之前。
 *
 * <p>不在这里的动作：{@code AUTO_*} 超时动作是定时器吃的，不是给人点的；补偿单的下发由内部命令发起，
 * 买家侧没有入口。
 */
@Schema(enumAsRef = true)
public enum RefundAvailableAction {

    /** 买家撤销（待处理 / 待寄回） */
    CANCEL,

    /** 买家填写回寄物流（待寄回，可重复提交覆盖运单号） */
    RETURN_GOODS,

    /** 买家重新申请：不是本单出边，而是「再开一张新单」的资格（窗口未过且有可退额度） */
    REAPPLY,

    /** 卖家同意（待处理）：仅退款/补偿直接发起退款，退货退款进入待寄回 */
    AGREE,

    /** 卖家确认收到退货（已寄回 → 卖家已收货 → 发起退款） */
    RECEIVE_RETURN,

    /** 卖家确认拦截成功（已寄回 → 已撤销）：货已离开买家、不再退回，钱也不出 */
    INTERCEPT,

    /** 卖家拒绝（待处理；七天无理由强制单不给这颗按钮） */
    REJECT,

    /** 人工重试（失败 → 退款中）：自动重试耗尽后的出口 */
    RETRY;

    /**
     * 买家视角：待处理可撤销；待寄回可撤销 + 回寄；已寄回仍可改单号（货在途，卖家还没确认收货，AFS-41）；
     * 终态且窗口未过可重新申请（同单退掉部分商品后仍能再申请）。
     *
     * <p>「重新申请」吃订单的申请窗口与剩余可退额度，退款单看不见订单，故资格由 service 经 order :: api 点查后
     * 以布尔喂进来——本枚举不自己判窗口。
     */
    public static List<RefundAvailableAction> buyerActions(RefundStatus status, boolean reapplyAllowed) {
        return switch (status) {
            case PENDING -> List.of(CANCEL);
            case RETURN_PENDING -> List.of(CANCEL, RETURN_GOODS);
            case RETURNED -> List.of(RETURN_GOODS);
            case REFUNDED, REJECTED, CANCELLED -> reapplyAllowed ? List.of(REAPPLY) : List.of();
            default -> List.of();
        };
    }

    /**
     * 卖家视角：待处理给同意/拒绝（强制单只剩同意）；已寄回给确认收货/确认拦截（正常推进在前）；
     * 失败给人工重试。其余状态没有卖家动作——退款中归渠道与定时器，终态已收口。
     */
    public static List<RefundAvailableAction> sellerActions(RefundStatus status, boolean noReasonEnforced) {
        return switch (status) {
            case PENDING -> noReasonEnforced ? List.of(AGREE) : List.of(AGREE, REJECT);
            case RETURNED -> List.of(RECEIVE_RETURN, INTERCEPT);
            case FAILED -> List.of(RETRY);
            default -> List.of();
        };
    }
}
