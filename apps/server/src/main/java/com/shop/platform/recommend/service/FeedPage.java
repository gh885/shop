package com.shop.platform.recommend.service;

import com.shop.platform.product.api.ProductCardView;
import java.util.List;

/**
 * feed 一页（service 形状类，直出即 wire 契约的原料）：已召回的卡片 + 下一页游标。
 *
 * <p>没有 total：feed 不做 count（见 docs/decisions/home-feed.md 决策二）——末页靠 nextCursor 为 null 表达。
 */
public record FeedPage(List<ProductCardView> items, String nextCursor) {}
