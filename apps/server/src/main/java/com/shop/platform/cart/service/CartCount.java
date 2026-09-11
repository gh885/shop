package com.shop.platform.cart.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 购物车角标计数：总数 + 已勾选数，前端免拉整车。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record CartCount(@Schema(requiredMode = REQUIRED) long total, @Schema(requiredMode = REQUIRED) long selected) {}
