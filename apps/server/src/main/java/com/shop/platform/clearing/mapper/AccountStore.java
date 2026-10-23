package com.shop.platform.clearing.mapper;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 账户的建与查。
 *
 * <p>账户按需创建，不预先种：`(owner_type, owner_id, account_type, currency)` 唯一，
 * 并发建同一个账户靠 {@code ON CONFLICT DO NOTHING} 兜住，不会出现两个"商家待结算"。
 */
@Component
public class AccountStore {

    private static final String ENSURE =
            """
            INSERT INTO clearing.account (owner_type, owner_id, account_type, currency)
            VALUES (:ownerType, :ownerId, :accountType, :currency)
            ON CONFLICT (owner_type, owner_id, account_type, currency) DO NOTHING
            RETURNING id
            """;

    private static final String FIND =
            """
            SELECT id FROM clearing.account
             WHERE owner_type = :ownerType AND owner_id = :ownerId
               AND account_type = :accountType AND currency = :currency
            """;

    /** 平台/渠道级账户没有具体主体，用全零 UUID 占位——NULL 在唯一约束里互不相等。 */
    public static final UUID PLATFORM_OWNER = new UUID(0L, 0L);

    private final JdbcClient jdbc;

    public AccountStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public UUID ensure(String ownerType, UUID ownerId, String accountType, String currency) {
        Optional<UUID> created = jdbc.sql(ENSURE)
                .param("ownerType", ownerType)
                .param("ownerId", ownerId)
                .param("accountType", accountType)
                .param("currency", currency)
                .query(UUID.class)
                .optional();
        if (created.isPresent()) {
            return created.get();
        }
        return jdbc.sql(FIND)
                .param("ownerType", ownerType)
                .param("ownerId", ownerId)
                .param("accountType", accountType)
                .param("currency", currency)
                .query(UUID.class)
                .optional()
                .orElseThrow(() ->
                        new IllegalStateException("账户并发创建后查不到: " + ownerType + "/" + ownerId + "/" + accountType));
    }
}
