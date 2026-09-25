package com.shop.platform.account.dto;

/** 管理端买家列表筛选：状态与关键字均为可选，空值表示不过滤。 */
public record AdminUserQuery(String status, String keyword) {}
