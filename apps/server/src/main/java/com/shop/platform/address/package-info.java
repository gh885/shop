/**
 * Address 模块 —— 商家侧履约地址：发货/退货/揽收/账单地址的生命周期与默认解析。
 *
 * <p>schema: merchant_address。地址本体（addresses）与履约角色（address_roles）分离：
 * 一个物理地址可在同一店铺/不同用途下复用。买家收货地址仍在 user 模块（user_profile.addresses），
 * 两者语义不同（买家=收件人通讯录，商家=寄件责任主体），不合并。
 *
 * <p>消费方（order/fulfillment/after-sales）经 address :: api 读取 {@code
 * com.shop.platform.address.api.MerchantAddressReadQuery} 拿不可变快照，自行持久化副本，
 * 禁止 import 本模块 mapper/repo、禁止跨 schema JOIN。本模块自身不消费别的业务模块的 service/repo。
 */
@ApplicationModule(displayName = "Address")
package com.shop.platform.address;

import org.springframework.modulith.ApplicationModule;
