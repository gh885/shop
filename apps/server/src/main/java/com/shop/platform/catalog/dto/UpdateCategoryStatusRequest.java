package com.shop.platform.catalog.dto;

import jakarta.validation.constraints.NotBlank;

/** 改类目状态。只收目标状态，当前状态由服务端读——让调用方传"从什么改成什么"就多一个能传错的参数。 */
public record UpdateCategoryStatusRequest(@NotBlank String status) {}
