package com.shop.platform.rum;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.rum.dto.AdminRumEventQuery;
import com.shop.platform.rum.dto.AdminRumIssueQuery;
import com.shop.platform.rum.service.AdminRumEventDetail;
import com.shop.platform.rum.service.AdminRumEventItem;
import com.shop.platform.rum.service.AdminRumIssueItem;
import com.shop.platform.rum.service.RumQueryService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 遥测排查读侧对着**真库**的那一半。
 *
 * <p>纯单测验不到的四件事，全部是「不连库就不会报错、只会给错答案」的：
 *
 * <ol>
 *   <li>{@code count(DISTINCT session_id)} 真的按会话去重，而不是被数成行数（写成 {@code count(*)} 一样能跑）；
 *   <li>{@code GROUP BY} 的分页 total 是**组数**不是行数——MP 默认的 count 优化会把 GROUP BY 摘掉，
 *       那数出来的是行数，症状是前端分页器凭空多出几十页。这条靠「同一批数据里行数 ≠ 组数」才验得出来；
 *   <li>聚合出来的时间列能落进出参的 {@code OffsetDateTime}（map 投影不走 TypeHandler，见 service 里那段注释）；
 *   <li>没有指纹的事件**不进**聚合——指纹为空的那一大坨是这条查询最容易踩歪的地方。
 * </ol>
 *
 * <p>断言一律用「相对自己造的种子」，不假设表是空的：同一批 IT 共用 shop_test，别的用例留下的行不该
 * 让这里变红（那些用例自己会清）。所以总数类断言取的是**前后增量**，不是绝对值。
 */
@SpringBootTest
class RumQueryIT extends IntegrationTestSupport {

    /** 全量一页：断言「顺序」时要看得见自己造的所有组，10 条一页会把它们截掉 */
    private static final PageParams ALL = new PageParams(1, PageParams.SIZE_MAX);

    private static final AdminRumIssueQuery NO_FILTER = new AdminRumIssueQuery(null, null, null, null);

    @Autowired
    private RumQueryService query;

    /** 本次用例的会话前缀：造数与清理都按它圈定 */
    private String tag;

    @BeforeEach
    void openScope() {
        tag = "itq-" + UUID.randomUUID() + "-";
        db.onDelete("DELETE FROM rum.rum_events WHERE session_id LIKE ?", tag + "%");
    }

    @Test
    void 按影响会话数降序_不按上报条数() {
        String wide = "fp-wide-" + tag;
        String noisy = "fp-noisy-" + tag;
        // wide：3 个人各撞一次 —— 这才是「影响面」
        event(wide, "web", "error", session("1"), "boom");
        event(wide, "web", "error", session("2"), "boom");
        event(wide, "web", "error", session("3"), "boom");
        // noisy：1 个人撞 5 次 —— 次数多，但只有一个人在受影响
        for (int i = 0; i < 5; i++) {
            event(noisy, "web", "error", session("4"), "loop");
        }

        List<AdminRumIssueItem> rows = query.pageIssues(ALL, NO_FILTER).records();

        AdminRumIssueItem a = pick(rows, wide);
        AdminRumIssueItem b = pick(rows, noisy);
        assertThat(a.sessions()).as("3 个不同会话").isEqualTo(3);
        assertThat(a.events()).isEqualTo(3);
        assertThat(b.sessions()).as("5 次上报只来自 1 个会话").isEqualTo(1);
        assertThat(b.events()).isEqualTo(5);
        assertThat(rows.indexOf(a)).as("会话多的要排在次数多的前面").isLessThan(rows.indexOf(b));
    }

    /**
     * 同一指纹落在两个端上算**两个问题**；顺带钉住分页 total 是组数。
     *
     * <p>种子故意选成「3 行落进 2 个组」：把 total 数成行数就会被这条抓出来（那会 +3 而不是 +2），
     * 而这是 MP 那条默认 count 优化的典型症状。
     */
    @Test
    void 同一指纹在两个端算两个问题_且分页总数是组数() {
        long before = query.pageIssues(ALL, NO_FILTER).total();
        String fp = "fp-crosstab-" + tag;
        event(fp, "web", "error", session("a"), "boom");
        event(fp, "web", "error", session("b"), "boom");
        event(fp, "seller", "error", session("c"), "boom");

        PageResult<AdminRumIssueItem> page = query.pageIssues(ALL, NO_FILTER);

        assertThat(page.total() - before).as("3 行落成 2 个组").isEqualTo(2);
        assertThat(page.records().stream()
                        .filter(r -> fp.equals(r.fingerprint()))
                        .count())
                .as("同一个指纹在列表里出现两次，各带自己的端")
                .isEqualTo(2);
    }

    /** 没有指纹的事件（性能、接口）不参与聚合：它们聚成一个巨大的空指纹桶，会把真问题顶到第二页 */
    @Test
    void 没有指纹的事件不进聚合() {
        long before = query.pageIssues(ALL, NO_FILTER).total();
        event(null, "web", "performance", session("p"), "LCP");

        assertThat(query.pageIssues(ALL, NO_FILTER).total() - before).isZero();
    }

    @Test
    void 明细列表按指纹筛_只给这一组() {
        String fp = "fp-events-" + tag;
        event(fp, "web", "error", session("x"), "boom");
        event(fp, "web", "error", session("y"), "boom");
        event("fp-other-" + tag, "web", "error", session("z"), "别的");

        PageResult<AdminRumEventItem> page =
                query.pageEvents(ALL, new AdminRumEventQuery(fp, null, null, null, null, null));

        assertThat(page.total()).isEqualTo(2);
        assertThat(page.records()).allSatisfy(r -> assertThat(r.fingerprint()).isEqualTo(fp));
        assertThat(page.records().getFirst().message()).isEqualTo("boom");
        assertThat(page.records().getFirst().route()).isEqualTo("/orders/$id");
    }

    @Test
    void 详情给出整条原件() {
        String fp = "fp-detail-" + tag;
        String sid = session("d");
        jdbc.update(
                """
                INSERT INTO rum.rum_events (ts, app, kind, session_id, fingerprint, message, payload, created_at)
                VALUES (NOW(), 'web', 'error', ?, ?, 'boom', ?, NOW())
                """,
                sid,
                fp,
                "{\"stack\":\"Error: boom\",\"breadcrumbs\":[{\"category\":\"click\"}]}");
        UUID id = jdbc.queryForObject("SELECT id FROM rum.rum_events WHERE session_id = ?", UUID.class, sid);

        AdminRumEventDetail detail = query.eventDetail(id);

        assertThat(detail.message()).isEqualTo("boom");
        assertThat(detail.fingerprint()).isEqualTo(fp);
        // 原件原样透传：展示层不许悄悄丢掉里面任何一格
        assertThat(detail.payload()).contains("Error: boom").contains("breadcrumbs");
        assertThat(detail.createdAt()).as("落库时刻必须能落进 OffsetDateTime").isNotNull();
    }

    /**
     * 默认窗口是最近 24 小时，不是全部。
     *
     * <p>「放宽窗口才看得见」这条假设了 24 小时之外没有别的用例留下的行——本目录的 {@code RumEventArchiveIT}
     * 造的旧行是 30 天前（在 7 天窗口外），当场就会删掉，所以这条断言是稳的。
     */
    @Test
    void 默认只看最近24小时_放宽窗口才看得到旧事件() {
        long before = query.pageIssues(ALL, NO_FILTER).total();
        jdbc.update(
                """
                INSERT INTO rum.rum_events (ts, app, kind, session_id, fingerprint, message, payload, created_at)
                VALUES (NOW(), 'web', 'error', ?, ?, 'old', '{}', NOW() - INTERVAL '3 days')
                """,
                session("old"),
                "fp-old-" + tag);

        assertThat(query.pageIssues(ALL, NO_FILTER).total())
                .as("3 天前的不该出现在默认窗口里")
                .isEqualTo(before);
        assertThat(query.pageIssues(
                                ALL,
                                new AdminRumIssueQuery(
                                        null, null, OffsetDateTime.now().minusDays(7), OffsetDateTime.now()))
                        .total())
                .as("窗口放宽到 7 天就该出现")
                .isEqualTo(before + 1);
    }

    @Test
    void app与kind照白名单筛() {
        String fp = "fp-filter-" + tag;
        event(fp, "seller", "error", session("f1"), "boom");
        event(fp, "web", "error", session("f2"), "boom");

        PageResult<AdminRumEventItem> sellerOnly =
                query.pageEvents(ALL, new AdminRumEventQuery(fp, "seller", null, null, null, null));

        assertThat(sellerOnly.total()).isEqualTo(1);
        assertThat(sellerOnly.records().getFirst().app()).isEqualTo("seller");
    }

    /**
     * 上界默认是**空的**：写侧时钟比读侧快一点时，刚上报的事件必须还看得见。
     *
     * <p>这是本模块踩过的真坑，不是假想：种子用 PG 的 {@code NOW()} 写行、查询用 JVM 的 {@code now()}
     * 当上界，而 PG 在 WSL 里、JVM 在宿主上，两者差一百多毫秒——**最后插入的那几行就被切掉了**，
     * 症状是「计数少 1」「按指纹筛出 0 条」这种看着像数据错、其实是时钟错的结果。
     * 生产里写读是同一个应用时钟，不会撞上；多实例部署下实例间的那几毫秒才会，而那时正是
     * 「刚挂了一大批，列表里却啥也没有」。
     */
    @Test
    void 默认窗口没有上界_写侧时钟稍快也看得见() {
        long before = query.pageIssues(ALL, NO_FILTER).total();
        jdbc.update(
                """
                INSERT INTO rum.rum_events (ts, app, kind, session_id, fingerprint, message, payload, created_at)
                VALUES (NOW(), 'web', 'error', ?, ?, 'ahead', '{}', ?)
                """,
                session("ahead"),
                "fp-ahead-" + tag,
                OffsetDateTime.now().plusSeconds(5));

        assertThat(query.pageIssues(ALL, NO_FILTER).total() - before)
                .as("created_at 比读侧现在快 5 秒的行，不该被默认窗口切掉")
                .isEqualTo(1);
    }

    /**
     * 一条种子事件。{@code fingerprint} 传 null 造「不属于任何问题」的那一类（性能 / 接口事件）。
     *
     * <p>时刻刻意用 PG 的 {@code NOW()} 而不是 JVM 的 {@code now()}：这样每个用例都在顺带验
     * 「写侧时钟与读侧不是同一个也能查得到」——那正是上面那条回归用例钉住的性质。
     */
    private void event(String fingerprint, String app, String kind, String sessionId, String message) {
        jdbc.update(
                """
                INSERT INTO rum.rum_events (ts, app, kind, session_id, fingerprint, route, message, payload, created_at)
                VALUES (NOW(), ?, ?, ?, ?, '/orders/$id', ?, '{}', NOW())
                """,
                app,
                kind,
                sessionId,
                fingerprint,
                message);
    }

    private String session(String suffix) {
        return tag + suffix;
    }

    private static AdminRumIssueItem pick(List<AdminRumIssueItem> rows, String fingerprint) {
        return rows.stream()
                .filter(r -> fingerprint.equals(r.fingerprint()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("列表里没有指纹 " + fingerprint + " 的那一行"));
    }
}
