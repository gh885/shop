/**
 * Payment 模块 —— 支付流水与收银台。两段式状态机：发起（PENDING）→ 确认（SUCCESS/FAILED），
 * 渠道支持 MOCK（默认，无外部 IO）与支付宝（沙箱 / 生产，`shop.payment.channel=ALIPAY`）。
 *
 * <p>schema: payment。订单前置校验走 order :: api 的 OrderReadQuery 只读点查，不 import order 内部类型；
 * 支付确认经 order :: api 的 OrderCommand.markPaid 同步同事务调用推进订单状态机，两侧原子生效。
 *
 * <p><b>确认端点的闸门按流水渠道分两种</b>：MOCK 只有买家 JWT 加流水归属，是收银台的便利设施而非资金证明；
 * 支付宝渠道由服务端 `queryTrade` 向渠道取权威结果，拿到成功态才推进。异步通知回调（匿名路由 + 报文验签）
 * 尚未建，今天靠回跳后的主动查询——状态机与事务口径届时平移，入口身份不（细则见 PAY-33、PAY-49）。
 *
 * <p>退款方向由事件驱动：order :: events 的 OrderCancelledEvent（已付款单取消）与 aftersale :: events
 * 的 AfterSaleRefundedEvent（售后退款）各自同步同事务监听，按流水自身渠道提交退款、受理后再置 REFUNDED。
 * 退回真实渠道时监听时机仍需改 AFTER_COMMIT + outbox（`kernel.event_publication` 登记表与重投任务已备）。
 */
@ApplicationModule(
        displayName = "Payment",
        allowedDependencies = {"order :: api", "order :: events", "aftersale :: events"})
package com.shop.platform.payment;

import org.springframework.modulith.ApplicationModule;
