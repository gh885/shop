/**
 * User 模块 — 买家（会员）个人资料域：收货地址等买家侧数据
 *
 * <p>schema: user_profile（user 是 PG 保留字，schema 加后缀规避）
 *
 * <p>收货地址归买家所有、独立于订单存在。order 模块结算时按 ID 只读跨 schema 查询，不拥有地址。
 */
@ApplicationModule(displayName = "User")
package com.shop.platform.user;

import org.springframework.modulith.ApplicationModule;
