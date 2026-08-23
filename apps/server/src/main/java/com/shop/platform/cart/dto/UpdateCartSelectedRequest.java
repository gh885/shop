package com.shop.platform.cart.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * 批量勾选入参：全选/取消全选、按店铺勾选共用一个接口。
 * itemIds 省略或为空 = 作用于整车；归属校验靠 SQL 带 user_id 条件，不泄露他人条目
 */
public record UpdateCartSelectedRequest(List<UUID> itemIds, @NotNull Boolean selected) {}
