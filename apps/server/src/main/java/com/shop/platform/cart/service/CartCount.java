package com.shop.platform.cart.service;

/** 购物车角标计数：总数 + 已勾选数，前端免拉整车 */
public record CartCount(long total, long selected) {}
