package com.shop.platform.account.api;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 地址只读查询（跨模块消费）：按主键点查本模块 schema 的投影列，禁止 JOIN 与写。
 */
@Component
@RequiredArgsConstructor
public class AddressReadQuery {

    private final JdbcTemplate jdbc;

    /** 单条地址投影：order 结算取收货快照用，查无此行返回 empty */
    public Optional<AddressSnapshotView> byId(UUID addressId) {
        return jdbc
                .query(
                        "SELECT user_id, receiver_name, phone, region_code, province, city, district, detail, deleted_at "
                                + "FROM account.addresses WHERE id = ?",
                        (rs, i) -> new AddressSnapshotView(
                                rs.getObject("user_id", UUID.class),
                                rs.getObject("deleted_at", OffsetDateTime.class),
                                rs.getString("receiver_name"),
                                rs.getString("phone"),
                                rs.getString("region_code"),
                                rs.getString("province"),
                                rs.getString("city"),
                                rs.getString("district"),
                                rs.getString("detail")),
                        addressId)
                .stream()
                .findFirst();
    }
}
