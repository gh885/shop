package com.shop.platform.catalog.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** 类目读模型。第一刀只需要发布闸门要用的那几列。 */
@Component
public class CategoryStore {

    private static final String FIND =
            """
            SELECT id, is_leaf, status, auto_approve, brand_policy
              FROM catalog.category
             WHERE id = :id
            """;

    private static final RowMapper<CategoryRow> MAPPER = RowMappers.of(CategoryRow.class);

    private final JdbcClient jdbc;

    public CategoryStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<CategoryRow> find(UUID categoryId) {
        return jdbc.sql(FIND).param("id", categoryId).query(MAPPER).optional();
    }

    public record CategoryRow(UUID id, boolean leaf, String status, boolean autoApprove, String brandPolicy) {}
}
