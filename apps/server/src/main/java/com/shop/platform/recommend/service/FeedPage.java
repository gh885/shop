package com.shop.platform.recommend.service;

import com.shop.platform.product.api.ProductCardView;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * feed 一页（service 形状类，直出即 wire 契约的原料）：已召回的卡片 + 下一页游标。
 *
 * <p>没有 total：feed 不做 count（规则见 docs/business-rules/cms.md FED-01）——末页靠 nextCursor 为 null 表达，
 * 所以 nextCursor 是 {@code @Nullable}（无下一页时取 null）。
 */
public record FeedPage(List<ProductCardView> items, @Nullable String nextCursor) {}
