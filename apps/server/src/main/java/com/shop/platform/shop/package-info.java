/**
 * Shop 模块 — 店铺、店铺成员（卖家侧业务单元）、入驻审核、商家发货/退货地址
 *
 * <p>schema: shop。成员手机号拼装与按手机号找人经 account :: api 的 UserReadQuery 完成。
 * 入驻审核（shop.shop_reviews）在本模块闭环：开店与入队同事务，平台员工审批（/admin/reviews，SHOP_REVIEW 权限）
 * 与店铺状态推进同事务——一个状态机不横跨两个 schema。
 * 商家地址（shop.addresses）是店铺的履约属性：本店维护默认发货/退货地址，order 发货、售后经 shop :: api 的
 * MerchantAddressReadQuery 拿不可变快照自行持久化；买家收货地址在 account 模块，两者语义不同不合并。
 */
@ApplicationModule(
        displayName = "Shop",
        allowedDependencies = {"account :: api"})
package com.shop.platform.shop;

import org.springframework.modulith.ApplicationModule;
