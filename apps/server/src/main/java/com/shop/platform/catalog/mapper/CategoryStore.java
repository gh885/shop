package com.shop.platform.catalog.mapper;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** 类目读模型。第一刀只需要发布闸门要用的那几列。 */
@Component
public class CategoryStore {

    private static final String FIND =
            """
            SELECT id, is_leaf, status, auto_approve, brand_policy
              FROM catalog.category
             WHERE id = ?
            """;

    private final JdbcTemplate jdbc;

    public CategoryStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<CategoryRow> find(UUID categoryId) {
        List<CategoryRow> rows = jdbc.query(
                FIND,
                (rs, row) -> new CategoryRow(
                        rs.getObject("id", UUID.class),
                        rs.getBoolean("is_leaf"),
                        rs.getString("status"),
                        rs.getBoolean("auto_approve"),
                        rs.getString("brand_policy")),
                categoryId);
        return rows.stream().findFirst();
    }

    public record CategoryRow(UUID id, boolean leaf, String status, boolean autoApprove, String brandPolicy) {}
}
