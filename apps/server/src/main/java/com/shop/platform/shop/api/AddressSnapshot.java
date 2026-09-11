package com.shop.platform.shop.api;

import com.shop.platform.common.Validate;
import java.util.UUID;

/**
 * 商家发货/退货地址快照值对象：order 打面单、售后前定格的责任主体信息 —— 不可变、按值比较。
 *
 * <p>跨模块读出即聚合、消费方（order/fulfillment/after-sales）自行持久化副本。
 * 两个字段完全相同的快照业务等价，正合值语义；归属哪家店才是身份，由消费方订单/售后实体承担。
 * sourceAddressId 仅审计追溯，不做业务依赖。
 *
 * <p>companyName（面单寄件人名称）可空：未填时消费方按 contactName 兜底。
 */
public record AddressSnapshot(
        UUID sourceAddressId,
        UUID shopId,
        String contactName,
        String phone,
        String regionCode,
        String province,
        String city,
        String district,
        String detail,
        String postalCode,
        String companyName) {

    public AddressSnapshot {
        contactName = Validate.requireText(contactName, "联系人");
        phone = Validate.requireText(phone, "电话");
        province = Validate.requireText(province, "省份");
        city = Validate.requireText(city, "城市");
        detail = Validate.requireText(detail, "详细地址");
    }
}
