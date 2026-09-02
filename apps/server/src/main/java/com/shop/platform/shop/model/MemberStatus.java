package com.shop.platform.shop.model;

/**
 * 店铺成员邀请状态：待生效（被邀请人未确认）/ 已生效。用于成员列表与邀请处理闸门。
 *
 * <p>DB 存 {@code name()}（varchar）。
 */
public enum MemberStatus {

    /** 待确认（邀请已发，对方登录后确认才生效） */
    PENDING,

    /** 已生效（ACTIVE 成员） */
    ACTIVE;

    public boolean isActive() {
        return this == ACTIVE;
    }
}
