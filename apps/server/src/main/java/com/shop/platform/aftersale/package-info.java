/**
 * Aftersale 模块 —— 退款单：申请、协商（同意/拒绝/撤销）、退货回寄与收货、渠道退款执行与重试。
 *
 * <p>schema: aftersale。退款单（refunds）是独立聚合：1 : N 退款单行（商品 / 运费 / 补偿），每次向渠道发起的
 * 调用另落一条执行记录（append-only）。状态机在 {@code model.RefundStatus.TRANSITIONS}，驱动在
 * {@code service.RefundService}，执行与重试在 {@code service.RefundExecutionService} / {@code infra.RefundRetryJob}。
 *
 * <p>与 order 的关系：申请前置（窗口 / 行数量额度 / 行实付与已退）经 order :: api 只读点查；退款成功经
 * {@code OrderCommand.settleRefund} 在<b>同一事务</b>里落行账本、订单与主订单已退额、履约重算与全额退款关单；
 * 每次退款状态变化经 {@code OrderCommand.syncAfterSaleBadge} 写回订单/主订单的售后角标（§5.4）。
 * order 不反向读本模块——否则与 aftersale → order :: api 成环。
 *
 * <p>已付款订单取消经 order :: events 的 OrderCancelledEvent 同步同事务触发（自动整单退款）——
 * 退款单的唯一写入口仍在本模块，order 只发一个「该退钱了」的通知。
 *
 * <p>资金方向：经 payment :: api 的 PaymentRefundCommand 提交渠道退款并累计流水已退额（同事务）；
 * 退货收货回补库存经 inventory :: api；整单退满退券经 coupon :: api；回寄包裹落 logistics :: api
 * （复用正向包裹与轨迹），履约重算所需的发货事实也经 logistics :: api 只读查。买家「寄到哪」经 shop :: api
 * 查询时实时解析默认退货地址（不存快照）。本模块不写任何他方 schema。
 */
@ApplicationModule(
        displayName = "AfterSale",
        allowedDependencies = {
            "order :: api",
            "order :: events",
            "payment :: api",
            "inventory :: api",
            "logistics :: api",
            "coupon :: api",
            "shop :: api"
        })
package com.shop.platform.aftersale;

import org.springframework.modulith.ApplicationModule;
