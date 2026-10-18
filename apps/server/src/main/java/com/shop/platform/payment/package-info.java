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
 * <p>退款方向由 aftersale 驱动：退款单确认成功时经 {@code payment :: api} 的 {@code PaymentRefundCommand}
 * 提交渠道退款并累计流水已退额（同事务）。payment 不监听 aftersale 的事件——那会让两个模块在命名接口层面成环
 * （aftersale → payment :: api 与 payment → aftersale :: events 互为上下游）。退回真实渠道时，退款单的重试线
 * 与执行记录保证渠道调用可重放（`kernel.event_publication` 登记表与重投任务已备）。
 */
@ApplicationModule(
        displayName = "Payment",
        allowedDependencies = {"order :: api"})
package com.shop.platform.payment;

import org.springframework.modulith.ApplicationModule;
