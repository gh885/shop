package com.shop.platform.seller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 店铺改名的入参。撞不撞名没有唯一索引约束，长度是唯一的硬口径。 */
public record RenameShopRequest(@NotBlank @Size(max = 40) String name) {}
