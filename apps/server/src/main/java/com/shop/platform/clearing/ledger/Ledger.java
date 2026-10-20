package com.shop.platform.clearing.ledger;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 记账入口。所有钱动的地方都必须经过这里，没有第二个写分录的路径。
 *
 * <p>规则见 {@code docs/domain/ledger.md}，这里落地其中三条：
 *
 * <ul>
 *   <li><b>组内和为 0</b>：一组分录的金额合计必须为零，否则拒绝，连一条都不会写入。
 *   <li><b>幂等</b>：{@code bizNo} 撞 {@code posting_group} 的唯一键时直接返回已有 group id，不重复记账。
 *   <li><b>余额是缓存</b>：{@code account.balance} 随分录同事务更新，但真相始终是分录本身。
 * </ul>
 */
@Component
public class Ledger {

    /** 一条分录：某个账户增减多少分。正数表示余额增加。 */
    public record Line(UUID accountId, long amount) {

        public Line {
            Objects.requireNonNull(accountId, "accountId");
            if (amount == 0) {
                throw new IllegalArgumentException("分录金额不能为 0");
            }
        }
    }

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

    public Ledger(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /**
     * 记一组分录。
     *
     * @return 分录组 id。重复提交同一个 {@code bizNo} 时返回上次那个 id，余额不会被第二次改动
     */
    @Transactional
    public UUID post(String bizType, String bizNo, String currency, List<Line> lines) {
        requireText(bizType, "bizType");
        requireText(bizNo, "bizNo");
        requireText(currency, "currency");
        Objects.requireNonNull(lines, "lines");
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("分录不能为空");
        }
        if (currency.length() != 3) {
            throw new IllegalArgumentException("币种必须是 3 位: " + currency);
        }

        long sum = lines.stream().mapToLong(Line::amount).sum();
        if (sum != 0) {
            throw new IllegalArgumentException("第 " + bizNo + " 组分录不平衡，合计 " + sum + " 分；复式记账要求为 0");
        }

        List<UUID> created =
                jdbc.query(INSERT_GROUP, (rs, row) -> rs.getObject(1, UUID.class), bizType, bizNo, currency);
        if (created.isEmpty()) {
            UUID existing = jdbc.queryForObject(FIND_GROUP, UUID.class, bizNo);
            if (existing == null) {
                throw new IllegalStateException("分录组冲突但查不到，bizNo = " + bizNo);
            }
            return existing;
        }

        UUID groupId = created.getFirst();
        for (Line line : lines) {
            int updated = jdbc.update(ADD_BALANCE, line.amount(), line.accountId(), currency);
            if (updated != 1) {
                throw new IllegalArgumentException("账户不存在或币种不符: " + line.accountId() + "（期望币种 " + currency + "）");
            }
            jdbc.update(INSERT_ENTRY, groupId, line.accountId(), line.amount());
        }
        return groupId;
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " 不能为空");
        }
    }
}
