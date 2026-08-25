/**
 * Order 模块 —— 交易主流程：结算预览、按店拆单下单、订单状态机、买卖家两侧视图。
 *
 * <p>schema: orders（复数避开 PG 保留字 order）。商品/地址快照在下单瞬间定格，之后 product 改价、
 * 商品/地址快照在下单瞬间定格，之后 product 改价、
 * 用户删地址均不影响旧单。库存冻结/扣实/释放经 inventory :: api 的 StockCommand 同步同事务调用，
 * 购物车清理是真通知、仍走事件总线（CartCheckedOutEvent）；支付推进由 payment 经 order :: api 的
 * OrderCommand.markPaid 同步调用完成（同事务扣实冻结库存）。本模块不写任何他方 schema。
 */
@ApplicationModule(
        displayName = "Order",
        allowedDependencies = {
            "product :: api",
            "inventory :: api",
            "shop :: api",
            "user :: api",
            "cart :: api",
            "cart :: events"
        })
package com.shop.platform.order;

import org.springframework.modulith.ApplicationModule;
