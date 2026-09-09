/**
 * AfterSale 模块 —— 售后单：申请、协商（同意/拒绝/撤销）、退货回寄与收货、退款口径。
 *
 * <p>schema: aftersale。售后单（tickets）是独立聚合：一笔订单可多次申请（同一时刻至多一张进行中，唯一部分索引兜底），
 * 每个动作落一行 ticket_events 时间线。转移表在 model 包的 TicketAction，驱动在 service 包的 AfterSaleService。
 *
 * <p>与 order 的关系是单向的：申请前置（已完成 + 申请窗口未过）与退货回补所需的行项经 order :: api 只读点查；
 * 每次转移经 order :: api 的 OrderCommand.syncAfterSale 把最近一张单的状态与退款口径写回 orders 的投影列
 * （订单列表/详情展示用，order 不反向读本模块——否则与 order :: api 成环）。退款方向发布 events 命名接口的
 * AfterSaleRefundedEvent，payment 同步监听落退款单据（同事务，落不成整体回滚、售后单停回原态）；
 * 退货收货回补库存经 inventory :: api 的 StockCommand.restock 同事务调用。本模块不写任何他方 schema。
 */
@ApplicationModule(
        displayName = "AfterSale",
        allowedDependencies = {"order :: api", "inventory :: api"})
package com.shop.platform.aftersale;

import org.springframework.modulith.ApplicationModule;
