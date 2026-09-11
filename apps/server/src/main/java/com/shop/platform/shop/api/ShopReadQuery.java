package com.shop.platform.shop.api;

import com.shop.platform.infra.db.IdBatchReader;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * 店铺只读查询（跨模块消费）：按主键 IN 点查本模块 schema 的投影列，交回 Map 供内存拼装。
 * 禁止 JOIN、按非键条件过滤、写。
 */
@Component
@RequiredArgsConstructor
public class ShopReadQuery {

    private final JdbcTemplate jdbc;

    /** shopId → 店名（展示字段拼装最常用），缺失的 id 不在 Map 中 */
    public Map<UUID, String> namesByIds(Collection<UUID> ids) {
        return columnByIds("name", ids, (rs, i) -> rs.getString("name"));
    }

    /** shopId → 店主 userId（审核队列拼店主联系方式等用），缺失的 id 不在 Map 中 */
    public Map<UUID, UUID> ownerIdsByShops(Collection<UUID> ids) {
        return columnByIds("owner_id", ids, (rs, i) -> rs.getObject("owner_id", UUID.class));
    }

    private <T> Map<UUID, T> columnByIds(String column, Collection<UUID> ids, RowMapper<T> row) {
        return IdBatchReader.byIds(
                jdbc,
                "SELECT id, " + column + " FROM shop.shops WHERE id IN (:ids)",
                ids,
                (rs, i) -> rs.getObject("id", UUID.class),
                row);
    }
}
