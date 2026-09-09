/**
 * Shop 模块对外命名接口：跨模块只读查询（{@code ShopReadQuery}，店名/店主拼装；
 * {@code MerchantAddressReadQuery}，商家默认发货/退货地址快照 {@code AddressSnapshot}，供 order 打面单/售后取寄件人）。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.shop.api;
