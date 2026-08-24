package com.shop.platform.order.service;

import com.shop.platform.common.Validate;

/**
 * 收货地址快照值对象：下单/预览时刻收货信息的定格 —— 不可变、无身份、按值比较。
 *
 * <p>把六个散落的收货字段聚成一个整体，让「快照」成为一等概念：跨 schema 读出即聚合、
 * 落库整块展开、传递不再散装。两个字段完全相同的快照业务上等价（同一收货目标），
 * 正是值语义；订单归属哪个用户/哪家店才是身份，由 Order 实体承担。
 *
 * <p>orders 表仍存六列平铺（receiver_name 等）—— MyBatis-Plus 无嵌入映射，
 * 实体不直接持有本类型；列 ↔ 快照的组装收敛在 {@code OrderService#loadAddressRow} 一处。
 */
public record AddressSnapshot(
        String receiverName, String receiverPhone, String province, String city, String district, String detail) {

    public AddressSnapshot {
        // 构造期自校验：非法快照根本造不出来。地址簿入口（AddressRequest）同为 NotBlank，两侧约束对齐
        receiverName = requireText(receiverName, "收货人");
        receiverPhone = requireText(receiverPhone, "收货人电话");
        province = requireText(province, "省份");
        city = requireText(city, "城市");
        district = requireText(district, "区县");
        detail = requireText(detail, "详细地址");
    }

    /** 非空校验 + trim 归一化：DB 里已是净值，这里幂等兜底，保证按值比较稳定 */
    private static String requireText(String value, String label) {
        Validate.isTrue(value != null && !value.isBlank(), label + "不能为空");
        return value.trim();
    }
}
