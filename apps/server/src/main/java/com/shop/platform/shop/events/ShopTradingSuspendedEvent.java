package com.shop.platform.shop.events;

import java.util.UUID;

/**
 * 店铺停止营业事件：店铺被驳回（审核未通过）或被平台禁用，不再具备营业资格时，在店铺状态推进的同一事务内发布。
 *
 * <p>消费方 product 同步监听（同事务，落不成一起回滚）：该店全部「上架」商品转「仓库中」（下架）。
 * 事件只说「这家店不营业了」这个事实，不带状态词表——{@code ShopStatus} 留在 shop 模块内，
 * {@code reason} 只是给人看的日志/审计口径串（如 {@code REVIEW_REJECTED}），消费方不得据它分支出第二份状态机。
 *
 * <p>反向不自动回上架：恢复到 ACTIVE 不发布任何事件，被级联下架的商品要卖家自己重新上架
 * （恢复营业 ≠ 平台背书这批历史商品仍满足上架门槛——重新上架会复检设价与有货，见 ProductService.on）。
 */
public record ShopTradingSuspendedEvent(UUID shopId, String reason) {}
