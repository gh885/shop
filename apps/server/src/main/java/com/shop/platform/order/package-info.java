/**
 * Order 模块 —— 交易主流程：结算预览、按店拆单下单、两条状态机的流转、买卖家两侧视图。
 *
 * <p>schema: orders（复数避开 PG 保留字 order）。商品/地址快照在下单瞬间定格，之后 product 改价、
 * 用户删地址均不影响旧单。库存冻结/扣实/释放经 inventory :: api 的 StockCommand 同步同事务调用，
 * 完成（确认收货/超时自动收货）经 product :: api 的 ProductCommand.addSold 同事务累加销量投影，
 * 购物车清理是真通知、仍走事件总线（CartCheckedOutEvent）；支付推进由 payment 经 order :: api 的
 * OrderCommand.markPaid 同步调用完成（同事务扣实冻结库存）。需要退款时发布 events 命名接口的两个事件
 * （已付款单取消、售后同意退款），payment 同步监听落退款单据。本模块不写任何他方 schema。
 *
 * <p>两条正交状态机：履约主线（status：PENDING_PAYMENT → PAID → SHIPPED → COMPLETED，待付款/待发货可取消）
 * 与售后线（after_sale_status：NONE → APPLYING →（REFUNDED / REJECTED / CLOSED））。规则收在 model 包的
 * OrderStatus / AfterSaleStatus，驱动收在 service 包的 OrderTransitionService，每次转移落一行
 * orders.order_status_log 审计流水。资金态归 payment（payments.status），订单只记 refund_amount 口径。
 * 三条时间驱动的超时契约（窗口见 OrderTimeouts，规则表见 OrderTimeout）：待付款超时关单、
 * 待发货超时自动取消+退款、已发货超时未确认自动收货。
 */
@ApplicationModule(
        displayName = "Order",
        allowedDependencies = {
            "product :: api",
            "inventory :: api",
            "shop :: api",
            "user :: api",
            "cart :: api",
            "cart :: events",
            "address :: api"
        })
package com.shop.platform.order;

import org.springframework.modulith.ApplicationModule;
