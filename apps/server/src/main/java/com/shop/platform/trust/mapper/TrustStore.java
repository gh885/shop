package com.shop.platform.trust.mapper;

import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 售卖资格的 SQL。只做点查，不在这里拼业务结论。
 */
@Component
public class TrustStore {

    private static final String CHECKS =
            """
            SELECT
                EXISTS(
                    SELECT 1 FROM trust.seller_profile p
                     WHERE p.merchant_id = ? AND p.status = 'active'
                ) AS profile_ok,
                EXISTS(
                    SELECT 1 FROM trust.category_grant g
                     WHERE g.merchant_id = ? AND g.category_id = ?
                       AND g.status = 'active'
                       AND (g.expires_at IS NULL OR g.expires_at > now())
                ) AS category_ok,
                (
                    CAST(? AS uuid) IS NULL
                    OR EXISTS(
                        SELECT 1 FROM trust.brand_grant b
                         WHERE b.merchant_id = ? AND b.brand_id = ? AND b.category_id = ?
                           AND b.status = 'active'
                           AND (b.expires_at IS NULL OR b.expires_at > now())
                    )
                ) AS brand_ok,
                EXISTS(
                    SELECT 1 FROM trust.credential c
                     WHERE c.merchant_id = ?
                       AND (c.category_id IS NULL OR c.category_id = ?)
                       AND c.status IN ('valid', 'expiring')
                       AND (c.expires_at IS NULL OR c.expires_at > now())
                ) AS credential_ok
            """;

    private final JdbcTemplate jdbc;

    public TrustStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Checks check(UUID merchantId, UUID categoryId, UUID brandId) {
        return jdbc.queryForObject(
                CHECKS,
                (rs, row) -> new Checks(
                        rs.getBoolean("profile_ok"),
                        rs.getBoolean("category_ok"),
                        rs.getBoolean("brand_ok"),
                        rs.getBoolean("credential_ok")),
                merchantId,
                merchantId,
                categoryId,
                brandId,
                merchantId,
                brandId,
                categoryId,
                merchantId,
                categoryId);
    }

    public record Checks(boolean profileOk, boolean categoryOk, boolean brandOk, boolean credentialOk) {}
}
