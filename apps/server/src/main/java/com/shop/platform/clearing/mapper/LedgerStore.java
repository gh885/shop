package com.shop.platform.clearing.mapper;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 账务的 SQL 只在这里。放在 {@code mapper} 包里是被 ArchUnit 规则逼的，也是对的：
 * 能用原生 SQL 的地方必须是少数、显式、可评审的几个包，否则数据权限和审计随时能被绕过。
 *
 * <p>这个类只搬数据，不做判断。金额配不配平、幂等怎么处理，都在 {@code Ledger} 里。
 */
@Component
public class LedgerStore {

    private static final String INSERT_GROUP =
            """
            INSERT INTO clearing.posting_group (biz_type, biz_no, currency)
            VALUES (:bizType, :bizNo, :currency)
            ON CONFLICT (biz_no) DO NOTHING
            RETURNING id
            """;

    private static final String FIND_GROUP = "SELECT id FROM clearing.posting_group WHERE biz_no = :bizNo";

    private static final String ADD_BALANCE =
            "UPDATE clearing.account SET balance = balance + :delta WHERE id = :id AND currency = :currency";

    private static final String INSERT_ENTRY =
            """
            INSERT INTO clearing.ledger_entry (group_id, account_id, amount, biz_date)
            VALUES (:groupId, :accountId, :amount, CURRENT_DATE)
            """;

    private final JdbcClient jdbc;

    public LedgerStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 空表示这个 {@code bizNo} 已经记过账。 */
    public Optional<UUID> createGroup(String bizType, String bizNo, String currency) {
        return jdbc.sql(INSERT_GROUP)
                .param("bizType", bizType)
                .param("bizNo", bizNo)
                .param("currency", currency)
                .query(UUID.class)
                .optional();
    }

    public Optional<UUID> findGroup(String bizNo) {
        return jdbc.sql(FIND_GROUP).param("bizNo", bizNo).query(UUID.class).optional();
    }

    /** 返回 false 表示账户不存在或币种不符。 */
    public boolean addToBalance(UUID accountId, long delta, String currency) {
        return jdbc.sql(ADD_BALANCE)
                        .param("delta", delta)
                        .param("id", accountId)
                        .param("currency", currency)
                        .update()
                == 1;
    }

    public void appendEntry(UUID groupId, UUID accountId, long amount) {
        jdbc.sql(INSERT_ENTRY)
                .param("groupId", groupId)
                .param("accountId", accountId)
                .param("amount", amount)
                .update();
    }
}
