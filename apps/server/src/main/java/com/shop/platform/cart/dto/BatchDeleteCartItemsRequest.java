package com.shop.platform.cart.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

/** 批量删除入参：「清除失效商品」「删除选中」都走这里，前端把要删的条目 ID 传上来 */
public record BatchDeleteCartItemsRequest(@NotEmpty List<UUID> itemIds) {}
