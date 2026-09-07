/**
 * Address 模块对外命名接口：跨模块只读查询（{@code MerchantAddressReadQuery}，供订单打面单/售后取发货/退货快照）。
 * 快照为不可变值对象，消费方自行持久化副本，禁止 import 本模块 mapper/repo。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.address.api;
