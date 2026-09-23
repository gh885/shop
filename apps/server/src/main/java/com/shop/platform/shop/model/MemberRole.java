package com.shop.platform.shop.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 店铺成员角色：店主 / 成员。店主固有通配权限 + 不可被改权/移除。
 *
 * <p>DB 存 {@code name()}（varchar）。
 */
@Schema(enumAsRef = true)
public enum MemberRole {

    /** 店主（创建人；通配权限、不可改权/移除） */
    OWNER,

    /** 成员（子账号，权限由店主授与被授予码集） */
    MEMBER;
}
