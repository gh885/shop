package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 审计动作语汇 —— 落在 orders.order_status_log.action 上的「这次转移是什么动作」。
 * 状态是后端语汇（{@link OrderStatus} / {@link AfterSaleStatus}），动作是业务语汇：
 * 同一个目标态可以由不同动作到达（买家取消 CANCEL 与超时关单 AUTO_CANCEL 都到 CANCELLED），
 * 靠这一列区分，回放历史时才说得清"谁按了什么"。
 */
@Schema(enumAsRef = true)
public enum OrderAction {

    /** 下单落库（无前态） */
    CREATE,

    /** 支付成功 */
    PAY,

    /** 买家取消 */
    CANCEL,

    /** 系统自动取消（待付款超时 / 待发货超时） */
    AUTO_CANCEL,

    /** 卖家发货 */
    SHIP,

    /** 买家确认收货 */
    RECEIVE,

    /** 系统自动确认收货（已发货超时未确认） */
    AUTO_RECEIVE,

    /** 买家申请售后 */
    AFTER_SALE_APPLY,

    /** 卖家同意售后并退款（仅退款） */
    AFTER_SALE_REFUND,

    /** 卖家同意退货退款（进入退货流程，尚未退款） */
    AFTER_SALE_AGREE_RETURN,

    /** 买家回寄并填写退货物流单 */
    AFTER_SALE_RETURN_GOODS,

    /** 卖家拒绝售后 */
    AFTER_SALE_REJECT,

    /** 买家撤销售后申请 */
    AFTER_SALE_CLOSE
}
