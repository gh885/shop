/**
 * Shop 模块 — 店铺、店铺成员（卖家侧业务单元）、商家发货/退货地址
 *
 * <p>schema: shop。成员手机号拼装与按手机号找人经 auth :: api 的 UserReadQuery 完成。
 * 商家地址（shop.addresses）是店铺的履约属性：本店维护默认发货/退货地址，order 发货、售后经 shop :: api 的
 * MerchantAddressReadQuery 拿不可变快照自行持久化；买家收货地址在 user 模块，两者语义不同不合并。
 */
@ApplicationModule(
        displayName = "Shop",
        allowedDependencies = {"auth :: api"})
package com.shop.platform.shop;

import org.springframework.modulith.ApplicationModule;
