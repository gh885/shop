/**
 * Admin 模块 — 平台员工、店铺入驻审核（平台官方人员侧）
 *
 * <p>schema: admin
 *
 * <p>依赖 shop 模块的事件类（监听 ShopCreatedEvent 入队审核、发布 ShopReviewDecidedEvent），只依赖事件，不碰 shop 的表。
 */
@ApplicationModule(displayName = "Admin", allowedDependencies = "shop")
package com.shop.platform.admin;

import org.springframework.modulith.ApplicationModule;
