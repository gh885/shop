package com.shop.platform.shop.service;

import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import java.util.List;
import java.util.UUID;

/** 成员列表项：含跨 schema 拼装的手机号 + 被授予的权限码（OWNER 为空集，全权由角色判定） */
public record ShopMemberItem(
        UUID memberId, UUID userId, String phone, MemberRole role, MemberStatus status, List<String> permissions) {}
