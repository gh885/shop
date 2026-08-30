package com.shop.platform.order.model;

/**
 * 售后状态机转移表 —— 每一行是一条合法转移（from → target），也是售后线的<b>状态机唯一真相</b>。
 * 之所以不从 {@link AfterSaleStatus} 反推（像 {@link OrderStatus} 那样 sourcesOf），是因为退货退款让
 * REFUNDED 有了两个来源（仅退款 APPLYING→REFUNDED、退货 RETURNING→REFUNDED），而两者的副作用不同
 * （前者不回补库存、后者回补）——「该不该回补」只能由<b>知道来源的动作</b>决定，不能由目标态反推。
 *
 * <p>每行还携带：审计动作、发起方、抢不到转移（条件更新影响行数 0）时的 409 文案。
 * 侧效应（退款走网关、退货回补库存、发事件）不属于状态转移本身，由 service 层在转移成功后编排——
 * 故本枚举只声明「状态怎么走」，不声明「走了之后还要做什么」。
 */
public enum AfterSaleAction {

    /** 买家申请售后（仅退款或退货退款，申请时定 type） */
    APPLY(AfterSaleStatus.NONE, AfterSaleStatus.APPLYING, OrderAction.AFTER_SALE_APPLY, OrderActor.BUYER, "当前不可申请售后"),

    /** 卖家同意<b>仅退款</b>：APPLYING → REFUNDED，一步退款（货不退、无回补） */
    REFUND(
            AfterSaleStatus.APPLYING,
            AfterSaleStatus.REFUNDED,
            OrderAction.AFTER_SALE_REFUND,
            OrderActor.SELLER,
            "售后单状态已变更，当前不可同意"),

    /** 卖家同意<b>退货退款</b>：APPLYING → RETURNING（进入退货流程，暂不退款） */
    AGREE_RETURN(
            AfterSaleStatus.APPLYING,
            AfterSaleStatus.RETURNING,
            OrderAction.AFTER_SALE_AGREE_RETURN,
            OrderActor.SELLER,
            "售后单状态已变更，当前不可同意"),

    /** 买家回寄并填写退货物流单：态不变（仍是 RETURNING），只落物流单号并记审计 */
    RETURN_GOODS(
            AfterSaleStatus.RETURNING,
            AfterSaleStatus.RETURNING,
            OrderAction.AFTER_SALE_RETURN_GOODS,
            OrderActor.BUYER,
            "售后单状态已变更，当前不可回寄"),

    /** 卖家确认收到退货：RETURNING → REFUNDED，退款并回补库存 */
    RECEIVE_RETURN(
            AfterSaleStatus.RETURNING,
            AfterSaleStatus.REFUNDED,
            OrderAction.AFTER_SALE_REFUND,
            OrderActor.SELLER,
            "售后单状态已变更，当前不可确认收货"),

    /** 卖家拒绝售后申请 */
    REJECT(
            AfterSaleStatus.APPLYING,
            AfterSaleStatus.REJECTED,
            OrderAction.AFTER_SALE_REJECT,
            OrderActor.SELLER,
            "售后单状态已变更，当前不可拒绝"),

    /** 买家撤销售后申请 */
    CLOSE(
            AfterSaleStatus.APPLYING,
            AfterSaleStatus.CLOSED,
            OrderAction.AFTER_SALE_CLOSE,
            OrderActor.BUYER,
            "售后单状态已变更，当前不可撤销");

    private final AfterSaleStatus from;

    private final AfterSaleStatus target;

    private final OrderAction auditAction;

    private final OrderActor actor;

    private final String conflictMessage;

    AfterSaleAction(
            AfterSaleStatus from,
            AfterSaleStatus target,
            OrderAction auditAction,
            OrderActor actor,
            String conflictMessage) {
        this.from = from;
        this.target = target;
        this.auditAction = auditAction;
        this.actor = actor;
        this.conflictMessage = conflictMessage;
    }

    /** 合法前置状态：条件更新（WHERE after_sale_status = from）的闸门依据 */
    public AfterSaleStatus from() {
        return from;
    }

    /** 本动作的目标状态 */
    public AfterSaleStatus target() {
        return target;
    }

    public OrderAction auditAction() {
        return auditAction;
    }

    public OrderActor actor() {
        return actor;
    }

    /** 条件更新抢不到时的 409 文案 */
    public String conflictMessage() {
        return conflictMessage;
    }
}
