/**
 * Admin 模块 — 平台员工、店铺入驻审核（平台官方人员侧）
 *
 * <p>schema: admin
 *
 * <p>依赖 shop 模块的事件类（监听 ShopCreatedEvent 入队审核、发布 ShopReviewDecidedEvent）与
 * shop / auth 的 api 包只读查询（店名/店主手机号拼装），不碰他方的表。
 */
@ApplicationModule(
        displayName = "Admin",
        allowedDependencies = {"shop :: events", "shop :: api", "auth :: api"})
package com.shop.platform.admin;

import org.springframework.modulith.ApplicationModule;
