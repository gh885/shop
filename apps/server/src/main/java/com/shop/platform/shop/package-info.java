/**
 * Shop 模块 — 店铺、店铺成员（卖家侧业务单元）、入驻审核、商家发货/退货地址
 *
 * <p>schema: shop。成员手机号拼装与按手机号找人经 account :: api 的 UserReadQuery 完成。
 * 入驻审核（shop.shop_reviews）在本模块闭环：开店与入队同事务，平台员工审批（/admin/reviews，SHOP_REVIEW 权限）
 * 与店铺状态推进同事务——一个状态机不横跨两个 schema。
 * 商家地址（shop.addresses）是店铺的履约属性：本店维护默认发货/退货地址，order 发货、售后经 shop :: api 的
 * MerchantAddressReadQuery 拿不可变快照自行持久化；买家收货地址在 account 模块，两者语义不同不合并。
 *
 * <p>「这家店还能不能营业」是本模块说的话，两处出口：谓词 {@code ShopReadQuery.isActive}（下单/加购入口的闸门，
 * 只吐 boolean 不外泄 ShopStatus）与事件 {@code ShopTradingSuspendedEvent}（进入不可营业态时同事务播报，
 * product 据此级联下架该店在架商品）。状态词表不外泄：消费方既不 import shop.model，也不按 reason 分支。
 */
@ApplicationModule(
        displayName = "Shop",
        allowedDependencies = {"account :: api"})
package com.shop.platform.shop;

import org.springframework.modulith.ApplicationModule;
