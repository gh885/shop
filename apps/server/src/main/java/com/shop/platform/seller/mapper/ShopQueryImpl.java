package com.shop.platform.seller.mapper;

import com.shop.platform.seller.api.ShopQuery;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** 店铺点查的实现：店铺是 seller 的表，名字只从这里出。 */
@Component
public class ShopQueryImpl implements ShopQuery {

    private static final String FIND_NAME = "SELECT name FROM seller.shop WHERE id = :id";

    private final JdbcClient jdbc;

    public ShopQueryImpl(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public Optional<String> nameOf(UUID shopId) {
        return jdbc.sql(FIND_NAME).param("id", shopId).query(String.class).optional();
    }
}
