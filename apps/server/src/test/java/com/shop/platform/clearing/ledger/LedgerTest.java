package com.shop.platform.clearing.ledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.id.Ids;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 用 docs/domain/ledger.md 第 3 节那笔真实订单验证记账：A 卖 200（8% 佣金），B 卖 300 + 运费 10（6%），
 * 平台出资 50 券按 20/30 分摊。买家实付 460，卖家实得 184 + 292，平台佣金 34。
 */
@SpringBootTest
@ActiveProfiles("test")
class LedgerTest {

    private static final String CNY = "CNY";

    @Autowired
    private Ledger ledger;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID openAccount(String ownerType, String accountType) {
        return jdbc.queryForObject(
                """
                INSERT INTO clearing.account (owner_type, owner_id, account_type, currency)
                VALUES (?, ?, ?, ?) RETURNING id
                """,
                UUID.class,
                ownerType,
                Ids.newId(),
                accountType,
                CNY);
    }

    private long balanceOf(UUID accountId) {
        Long balance = jdbc.queryForObject("SELECT balance FROM clearing.account WHERE id = ?", Long.class, accountId);
        return balance == null ? 0 : balance;
    }

    private long groupSum(String bizNo) {
        Long sum = jdbc.queryForObject(
                """
                SELECT sum(e.amount) FROM clearing.ledger_entry e
                JOIN clearing.posting_group g ON g.id = e.group_id
                WHERE g.biz_no = ?
                """,
                Long.class,
                bizNo);
        return sum == null ? 0 : sum;
    }

    private int entryCount(UUID groupId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM clearing.ledger_entry WHERE group_id = ?", Integer.class, groupId);
        return count == null ? 0 : count;
    }

    private long globalTotal(String currency) {
        Long total = jdbc.queryForObject(
                """
                SELECT coalesce(sum(e.amount), 0) FROM clearing.ledger_entry e
                JOIN clearing.posting_group g ON g.id = e.group_id
                WHERE g.currency = ?
                """,
                Long.class,
                currency);
        return total == null ? 0 : total;
    }

    @Test
    void theWholeOrderBalancesAndEveryPartyGetsWhatItShould() {
        UUID buyer = openAccount("buyer", "available");
        UUID channel = openAccount("channel", "available");
        UUID subsidy = openAccount("subsidy", "available");
        UUID sellerA = openAccount("merchant", "available");
        UUID sellerB = openAccount("merchant", "available");
        UUID platform = openAccount("platform", "available");
        String orderNo = "SO" + Ids.newId();

        // 组 1 支付：买家付 460，钱进平台代收
        UUID pay = ledger.post(
                "trade",
                "trade:" + orderNo + ":pay",
                CNY,
                List.of(new Ledger.Line(buyer, -46000), new Ledger.Line(channel, 46000)));

        // 组 2 平台补贴：券的 50 块由平台出
        ledger.post(
                "promotion",
                "promotion:" + orderNo + ":subsidy",
                CNY,
                List.of(new Ledger.Line(subsidy, -5000), new Ledger.Line(channel, 5000)));

        // 组 3 清算：代收的 510 分成卖家 A 184、卖家 B 292、平台佣金 34
        ledger.post(
                "clearing",
                "clearing:" + orderNo + ":settle",
                CNY,
                List.of(
                        new Ledger.Line(channel, -51000),
                        new Ledger.Line(sellerA, 18400),
                        new Ledger.Line(sellerB, 29200),
                        new Ledger.Line(platform, 3400)));

        assertThat(entryCount(pay)).isEqualTo(2);
        assertThat(globalTotal(CNY)).as("全库分录按币种合计必须恒为 0").isZero();

        assertThat(balanceOf(buyer)).isEqualTo(-46000);
        assertThat(balanceOf(subsidy)).isEqualTo(-5000);
        assertThat(balanceOf(channel)).isZero();
        assertThat(balanceOf(sellerA)).isEqualTo(18400);
        assertThat(balanceOf(sellerB)).isEqualTo(29200);
        assertThat(balanceOf(platform)).isEqualTo(3400);
    }

    @Test
    void repostingTheSameBizNoDoesNotMoveMoneyTwice() {
        UUID buyer = openAccount("buyer", "available");
        UUID channel = openAccount("channel", "available");
        String bizNo = "trade:" + Ids.newId() + ":pay";
        List<Ledger.Line> lines = List.of(new Ledger.Line(buyer, -10000), new Ledger.Line(channel, 10000));

        UUID first = ledger.post("trade", bizNo, CNY, lines);
        UUID second = ledger.post("trade", bizNo, CNY, lines);

        assertThat(second).isEqualTo(first);
        assertThat(entryCount(first)).isEqualTo(2);
        assertThat(balanceOf(buyer)).isEqualTo(-10000);
        assertThat(balanceOf(channel)).isEqualTo(10000);
    }

    @Test
    void unbalancedGroupIsRejectedAndNothingIsWritten() {
        UUID a = openAccount("merchant", "available");
        UUID b = openAccount("merchant", "available");
        String bizNo = "trade:" + Ids.newId() + ":broken";

        assertThatThrownBy(() ->
                        ledger.post("trade", bizNo, CNY, List.of(new Ledger.Line(a, -10000), new Ledger.Line(b, 9000))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不平衡");

        Integer groups = jdbc.queryForObject(
                "SELECT count(*) FROM clearing.posting_group WHERE biz_no = ?", Integer.class, bizNo);
        assertThat(groups).isZero();
        assertThat(balanceOf(a)).isZero();
        assertThat(balanceOf(b)).isZero();
    }

    @Test
    void reversalRestoresBalancesWithoutTouchingTheOriginalEntries() {
        UUID seller = openAccount("merchant", "available");
        UUID channel = openAccount("channel", "available");
        String orderNo = "SO" + Ids.newId();

        ledger.post(
                "trade",
                "trade:" + orderNo + ":pay",
                CNY,
                List.of(new Ledger.Line(channel, -10000), new Ledger.Line(seller, 10000)));
        assertThat(balanceOf(seller)).isEqualTo(10000);

        // 冲正：新开一组反向分录，原分录原样留在库里
        ledger.post(
                "trade",
                "trade:" + orderNo + ":pay:reversal",
                CNY,
                List.of(new Ledger.Line(channel, 10000), new Ledger.Line(seller, -10000)));

        assertThat(balanceOf(seller)).isZero();
        assertThat(balanceOf(channel)).isZero();
        assertThat(globalTotal(CNY)).isZero();
    }

    @Test
    void entriesCannotBeUpdatedAfterTheyArePosted() {
        UUID seller = openAccount("merchant", "available");
        UUID channel = openAccount("channel", "available");
        UUID group = ledger.post(
                "trade",
                "trade:" + Ids.newId() + ":pay",
                CNY,
                List.of(new Ledger.Line(channel, -10000), new Ledger.Line(seller, 10000)));

        assertThatThrownBy(() -> jdbc.update("UPDATE clearing.ledger_entry SET amount = 1 WHERE group_id = ?", group))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("只追加");
    }

    @Test
    void unknownAccountIsRejectedAndNothingIsWritten() {
        UUID seller = openAccount("merchant", "available");

        assertThatThrownBy(() -> ledger.post(
                        "trade",
                        "trade:" + Ids.newId() + ":pay",
                        CNY,
                        List.of(new Ledger.Line(Ids.newId(), -10000), new Ledger.Line(seller, 10000))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("账户不存在");
    }
}
