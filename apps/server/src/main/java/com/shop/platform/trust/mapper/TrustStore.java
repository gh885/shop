package com.shop.platform.trust.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 售卖资格的 SQL。只做点查，不在这里拼业务结论。
 *
 * <p>四条 {@code EXISTS} 拼成一行布尔。原来靠九个位置参数逐个对号入座，
 * 其中 {@code merchantId} 出现四次、{@code categoryId} 三次——顺序写反了结果会变成
 * "看起来能卖但其实没授权"，而且不会报错。改成命名参数之后这类错位不可能再发生。
 */
@Component
public class TrustStore {

    private static final String CHECKS =
            """
            SELECT
                EXISTS(
                    SELECT 1 FROM trust.seller_profile p
                     WHERE p.merchant_id = :merchantId AND p.status = 'active'
                ) AS profile_ok,
                EXISTS(
                    SELECT 1 FROM trust.category_grant g
                     WHERE g.merchant_id = :merchantId AND g.category_id = :categoryId
                       AND g.status = 'active'
                       AND (g.expires_at IS NULL OR g.expires_at > now())
                ) AS category_ok,
                (
                    CAST(:brandId AS uuid) IS NULL
                    OR EXISTS(
                        SELECT 1 FROM trust.brand_grant b
                         WHERE b.merchant_id = :merchantId AND b.brand_id = :brandId
                           AND b.category_id = :categoryId
                           AND b.status = 'active'
                           AND (b.expires_at IS NULL OR b.expires_at > now())
                    )
                ) AS brand_ok,
                EXISTS(
                    SELECT 1 FROM trust.credential c
                     WHERE c.merchant_id = :merchantId
                       AND (c.category_id IS NULL OR c.category_id = :categoryId)
                       AND c.status IN ('valid', 'expiring')
                       AND (c.expires_at IS NULL OR c.expires_at > now())
                ) AS credential_ok
            """;

    private static final RowMapper<Checks> MAPPER = RowMappers.of(Checks.class);

    private final JdbcClient jdbc;

    public TrustStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Checks check(UUID merchantId, UUID categoryId, UUID brandId) {
        return jdbc.sql(CHECKS)
                .param("merchantId", merchantId)
                .param("categoryId", categoryId)
                .param("brandId", brandId)
                .query(MAPPER)
                .single();
    }

    public record Checks(boolean profileOk, boolean categoryOk, boolean brandOk, boolean credentialOk) {}
}
