/**
 * Shop 模块 — 店铺、店铺成员（卖家侧业务单元）
 *
 * <p>schema: shop。成员手机号拼装与按手机号找人经 auth :: api 的 UserReadQuery 完成。
 */
@ApplicationModule(
        displayName = "Shop",
        allowedDependencies = {"auth :: api"})
package com.shop.platform.shop;

import org.springframework.modulith.ApplicationModule;
