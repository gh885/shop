package com.shop.platform.order.events;

import java.util.List;
import java.util.UUID;

/**
 * 购物车结算完成事件：一次结算（可能拆多单）成功事务内发布一次，cart 模块同步监听删除被购买的条目。
 * 立即购买（不经购物车）时 itemIds 为空列表，cart 侧空集合直接跳过。
 */
public record CartCheckedOutEvent(UUID userId, List<UUID> cartItemIds) {}
