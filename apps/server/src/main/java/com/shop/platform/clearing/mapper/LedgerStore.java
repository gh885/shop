package com.shop.platform.clearing.mapper;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 账务的 SQL 只在这里。放在 {@code store} 包里是被 ArchUnit 规则逼的，也是对的：
 * 能用原生 SQL 的地方必须是少数、显式、可评审的几个包，否则数据权限和审计随时能被绕过。
 *
 * <p>这个类只搬数据，不做判断。金额配不配平、幂等怎么处理，都在 {@code Ledger} 里。
 */
@Component
public class LedgerStore {

    private static final String INSERT_GROUP =
            """
            INSERT INTO clearing.posting_group (biz_type, biz_no, currency)
            VALUES (?, ?, ?)
            ON CONFLICT (biz_no) DO NOTHING
            RETURNING id
            """;

    private static final String FIND_GROUP = "SELECT id FROM clearing.posting_group WHERE biz_no = ?";

    private static final String ADD_BALANCE =
            "UPDATE clearing.account SET balance = balance + ? WHERE id = ? AND currency = ?";

    private static final String INSERT_ENTRY =
            """
            INSERT INTO clearing.ledger_entry (group_id, account_id, amount, biz_date)
            VALUES (?, ?, ?, CURRENT_DATE)
            """;

    private final JdbcTemplate jdbc;

    public LedgerStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 空表示这个 {@code bizNo} 已经记过账。 */
    public Optional<UUID> createGroup(String bizType, String bizNo, String currency) {
        List<UUID> created =
                jdbc.query(INSERT_GROUP, (rs, row) -> rs.getObject(1, UUID.class), bizType, bizNo, currency);
        return created.stream().findFirst();
    }

    public Optional<UUID> findGroup(String bizNo) {
        return jdbc.queryForList(FIND_GROUP, UUID.class, bizNo).stream().findFirst();
    }

    /** 返回 false 表示账户不存在或币种不符。 */
    public boolean addToBalance(UUID accountId, long delta, String currency) {
        return jdbc.update(ADD_BALANCE, delta, accountId, currency) == 1;
    }

    public void appendEntry(UUID groupId, UUID accountId, long amount) {
        jdbc.update(INSERT_ENTRY, groupId, accountId, amount);
    }
}
