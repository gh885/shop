package com.shop.platform.clearing.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.util.List;
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

    /**
     * 一个商家的全部账户余额。
     *
     * <p><b>这是缓存值，不是真相。</b> 真相是分录之和，日终对账负责比对两者。
     * 展示层直接读缓存是对的——每次查余额都把分录重算一遍，等于把对账的成本摊到每个页面上。
     *
     * <p>不返回全零余额的行？返回。账户是按需建的，一个从没收到过钱的商家查余额拿到空列表，
     * 和"有三个账户、余额都是 0"是两种不同的信息，前端要能分开。
     */
    private static final String BALANCES =
            """
            SELECT account_type, currency, balance
              FROM clearing.account
             WHERE owner_type = :ownerType AND owner_id = :ownerId
             ORDER BY currency, account_type
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

    public List<Balance> balances(String ownerType, UUID ownerId) {
        return jdbc.sql(BALANCES)
                .param("ownerType", ownerType)
                .param("ownerId", ownerId)
                .query(RowMappers.of(Balance.class))
                .list();
    }

    /**
     * 一个账户的余额。
     *
     * @param accountType {@code available}（可提现）/ {@code pending}（待结算）/ {@code frozen}（售后冻结）
     */
    public record Balance(String accountType, String currency, long balance) {}
}
