package com.shop.platform.address.api;

import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 商家地址只读查询（跨模块消费，经 address :: api）：按主键/默认发货/默认退货解析不可变快照。
 *
 * <p>单表查询（本 schema merchant_address.addresses），只解析 {@code 未删 且 ACTIVE} 的行；
 * 默认解析落到 {@code default_ship/default_return = TRUE}。禁止写、禁止按非键条件 JOIN 他 schema。
 */
@Component
@RequiredArgsConstructor
public class MerchantAddressReadQuery {

    private final JdbcTemplate jdbc;

    /** 按主键取快照：不存在/已删/停用返回 empty */
    public Optional<AddressSnapshot> byId(UUID addressId) {
        return query(" AND a.id = ? ", addressId);
    }

    /** 本店默认发货地址快照：无默认（或已删/停用）返回 empty —— 发货无寄件人即硬失败，由消费方决定上报 */
    public Optional<AddressSnapshot> resolveShipFrom(UUID shopId) {
        return query(" AND a.shop_id = ? AND a.default_ship = TRUE LIMIT 1 ", shopId);
    }

    /** 本店默认退货地址快照：无默认返回 empty（售后需回寄地址，交由消费方提示配置） */
    public Optional<AddressSnapshot> resolveReturnTo(UUID shopId) {
        return query(" AND a.shop_id = ? AND a.default_return = TRUE LIMIT 1 ", shopId);
    }

    private Optional<AddressSnapshot> query(String where, Object... args) {
        return jdbc
                .query(
                        SELECT_COLUMNS + " FROM merchant_address.addresses a "
                                + " WHERE a.deleted_at IS NULL AND a.status = 'ACTIVE' " + where,
                        (rs, i) -> new AddressSnapshot(
                                rs.getObject("id", UUID.class),
                                rs.getObject("shop_id", UUID.class),
                                rs.getString("contact_name"),
                                rs.getString("phone"),
                                rs.getString("region_code"),
                                rs.getString("province"),
                                rs.getString("city"),
                                rs.getString("district"),
                                rs.getString("detail"),
                                rs.getString("postal_code"),
                                rs.getString("company_name")),
                        args)
                .stream()
                .findFirst();
    }

    private static final String SELECT_COLUMNS =
            "SELECT a.id, a.shop_id, a.contact_name, a.phone, a.region_code, a.province, a.city, "
                    + "a.district, a.detail, a.postal_code, a.company_name ";
}
