package com.shop.platform.shop.service;

import java.util.UUID;

/** 店铺成员（店主视角）：成员记录 + 手机号 */
public record ShopMemberItem(UUID memberId, UUID userId, String phone, String role, String status) {}
