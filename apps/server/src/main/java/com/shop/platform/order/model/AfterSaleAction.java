package com.shop.platform.order.model;

/**
 * 售后线四个动作的一张表 —— 每行说清「转到哪、审计记什么、谁发起、抢不到时报什么」。
 * 售后四个动作除此之外的编排完全相同（条件更新 → 影响行数闸门 → 审计），
 * 故转移点只剩一句 {@code advanceAfterSale(orderId, action, …)}，加动作＝加一行。
 */
public enum AfterSaleAction {

    /** 买家申请售后 */
    APPLY(AfterSaleStatus.APPLYING, OrderAction.AFTER_SALE_APPLY, OrderActor.BUYER, "当前不可申请售后"),

    /** 卖家同意售后：同意即退款，一步到 REFUNDED（退款单据同事务落在 payment） */
    REFUND(AfterSaleStatus.REFUNDED, OrderAction.AFTER_SALE_REFUND, OrderActor.SELLER, "售后单状态已变更，当前不可同意"),

    /** 卖家拒绝售后 */
    REJECT(AfterSaleStatus.REJECTED, OrderAction.AFTER_SALE_REJECT, OrderActor.SELLER, "售后单状态已变更，当前不可拒绝"),

    /** 买家撤销售后申请 */
    CLOSE(AfterSaleStatus.CLOSED, OrderAction.AFTER_SALE_CLOSE, OrderActor.BUYER, "售后单状态已变更，当前不可撤销");

    private final AfterSaleStatus target;

    private final OrderAction auditAction;

    private final OrderActor actor;

    private final String conflictMessage;

    AfterSaleAction(AfterSaleStatus target, OrderAction auditAction, OrderActor actor, String conflictMessage) {
        this.target = target;
        this.auditAction = auditAction;
        this.actor = actor;
        this.conflictMessage = conflictMessage;
    }

    /** 本动作的目标态；合法前态由 {@link AfterSaleStatus#sourcesOf} 反推，不在此重复声明 */
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
