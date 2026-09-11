/**
 * Shop 模块对外命名接口：跨模块只读查询（{@code ShopReadQuery}，店名/店主拼装；
 * {@code MerchantAddressReadQuery}，商家默认发货/退货地址快照 {@code AddressSnapshot}，供 order 打面单/售后取寄件人；
 * {@code ShippingFeeReadQuery}，order 结算的运费报价 {@code ShippingQuote}——模板与计费规则是本模块的数据，
 * 「怎么算」不外泄给消费方）；跨模块写入口不在此处（模板由卖家自己维护，只有 /seller 端点）。
 * 跨模块命令目前一个也没有：运费在结算时由 order 只读询问，不反过来写 shop。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.shop.api;
