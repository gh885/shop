package com.shop.platform.catalog.mapper;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 品牌的读写。
 *
 * <p>现在只有一个 {@link #findName}：识别键要拿品牌名拼前缀（{@code APPLE:A3294}）。
 * 品牌的增删改审是平台侧的活，等 {@code CATEGORY_MANAGE} 的管理端做齐了再加。
 */
@Component
public class BrandStore {

    private static final String FIND_NAME = "SELECT name FROM catalog.brand WHERE id = :id";

    private final JdbcClient jdbc;

    public BrandStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<String> findName(UUID brandId) {
        return jdbc.sql(FIND_NAME).param("id", brandId).query(String.class).optional();
    }
}
