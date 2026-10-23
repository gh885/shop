package com.shop.platform.account.api;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 地址只读查询（跨模块消费）：按主键点查本模块 schema 的投影列，禁止 JOIN 与写。
 *
 * <p>归属校验是消费方职责（见 {@link AddressSnapshotView}）。
 */
@Component
public class AddressReadQuery {

    private static final String FIND =
            """
            SELECT buyer_id, receiver_name, phone, region_code, province, city, district, detail
              FROM account.addresses
             WHERE id = :id
            """;

    private final JdbcClient jdbc;

    public AddressReadQuery(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 单条地址投影：trade 下单取收货快照用，查无此行返回 empty */
    public Optional<AddressSnapshotView> byId(UUID addressId) {
        return jdbc.sql(FIND)
                .param("id", addressId)
                .query((rs, row) -> new AddressSnapshotView(
                        rs.getObject("buyer_id", UUID.class),
                        rs.getString("receiver_name"),
                        rs.getString("phone"),
                        rs.getString("region_code"),
                        rs.getString("province"),
                        rs.getString("city"),
                        rs.getString("district"),
                        rs.getString("detail")))
                .optional();
    }
}
