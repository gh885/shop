package com.shop.platform.cart.events;

import java.util.List;
import java.util.UUID;

/**
 * 购物车结算完成事件：一次结算（可能拆多单）成功事务内由 order 模块发布一次，cart 模块同步监听删除被购买的条目。
 * 立即购买（不经购物车）时 itemIds 为空列表，cart 侧空集合直接跳过。
 *
 * <p>事件类型归消费方模块所有：order 同时依赖 cart :: api（结算点查），若事件放 order 侧会形成模块环。
 */
public record CartCheckedOutEvent(UUID userId, List<UUID> cartItemIds) {}
