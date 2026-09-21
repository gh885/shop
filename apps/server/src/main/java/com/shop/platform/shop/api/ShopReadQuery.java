package com.shop.platform.shop.api;

import com.shop.platform.infra.db.IdBatchReader;
import com.shop.platform.shop.model.ShopStatus;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * 店铺只读查询（跨模块消费）：按主键 IN 点查本模块 schema 的投影列，交回 Map 供内存拼装。
 * 禁止 JOIN、按非键条件过滤、写。唯一的例外是 {@link #isActive} —— 交易入口的营业闸门谓词，
 * 只吐 boolean 不吐状态（与 account :: api 的 {@code UserReadQuery.isActive} 同一套做法）。
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

    /**
     * 营业闸门谓词（下单/加购等交易入口消费）：店铺存在且状态 ACTIVE 才放行，店铺缺失同样给 false。
     * 只吐谓词不吐 {@code ShopStatus} 枚举——状态词表留在本模块，消费方不必（也不允许）import shop.model。
     */
    public boolean isActive(UUID shopId) {
        List<String> statuses =
                jdbc.query("SELECT status FROM shop.shops WHERE id = ?", (rs, i) -> rs.getString(1), shopId);
        return !statuses.isEmpty() && ShopStatus.ACTIVE.name().equals(statuses.getFirst());
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
