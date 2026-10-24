package com.shop.platform.account.api;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 地址只读查询（跨模块消费）：按主键点查本模块 schema 的投影列，禁止 JOIN 与写。
 *
 * <p>归属在 SQL 里（{@code buyer_id} 随查询下发），别人的地址查出来是空——
 * 消费方不需要也不允许再做「查出来比对」的第二步。
 */
@Component
public class AddressReadQuery {

    private static final String FIND =
            """
            SELECT buyer_id, receiver_name, phone, region_code, province, city, district, detail
              FROM account.addresses
             WHERE id = :id AND buyer_id = :buyerId
            """;

    private final JdbcClient jdbc;

    public AddressReadQuery(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 单条地址投影：trade 下单取收货快照用；不是本人的地址与查无此行同为 empty（防枚举） */
    public Optional<AddressSnapshotView> byId(UUID addressId, UUID buyerId) {
        return jdbc.sql(FIND)
                .param("id", addressId)
                .param("buyerId", buyerId)
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
