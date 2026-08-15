package com.shop.platform.shop.service;

import java.time.OffsetDateTime;
import java.util.UUID;

/** 待确认邀请（我的视角）：成员记录 ID + 店名 */
public record ShopInviteItem(UUID memberId, UUID shopId, String shopName, OffsetDateTime createdAt) {}
