package com.shop.platform.catalog.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * 一页买家商品卡片。游标分页，与全项目列表同口径（{@code CursorCodec}）。
 *
 * @param nextCursor 下一页游标；null = 到底
 */
public record BuyerProductPage(List<BuyerProductCard> items, @Schema(nullable = true) String nextCursor) {}
