package com.shop.platform.rum;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.rum.mapper.RumEventMapper;
import com.shop.platform.rum.service.RumEventArchive;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/**
 * 明细真的进了库——**只有连真库才验得到的那一半**。
 *
 * <p>纯单测验的是「JSON 怎么变成行」；这里验的是「行能不能写进这张表」：迁移建出来的列宽对不对、
 * jsonb 有没有被当成普通字符串塞进去（那样会报类型错）、写入路径有没有被 Hikari 的
 * {@code stringtype=unspecified} 兜住。这三件事任何一件错了，症状都是**消费端不停重投**
 * ——而重投的后果是分区卡住，不是一条报错。
 *
 * <p>顺带验保留期的那个 DELETE 真能删掉该删的、且不碰不该删的：清理作业写错方向的代价是
 * 「把还有用的数据删了」，而那件事没有回滚。
 */
@SpringBootTest
class RumEventArchiveIT extends IntegrationTestSupport {

    @Autowired
    private RumEventArchive archive;

    @Autowired
    private RumEventMapper mapper;

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void 一条事件落成一行_信封进列_原件进payload() {
        String sessionId = "it-" + UUID.randomUUID();
        db.onDelete("DELETE FROM rum.rum_events WHERE session_id = ?", sessionId);

        archive.append(
                json.readTree(
                        """
                        {"schema":"shop.fe.v1","app":"web","version":"abc1234","env":"prod","kind":"error",
                         "name":"js_error","route":"/orders/$id","sessionId":"%s","userId":"u-1",
                         "ts":1770000000000,"message":"boom","fingerprint":"boom::at f",
                         "breadcrumbs":[{"category":"click","message":"点了结算"}],
                         "device":{"browser":"chrome 130","deviceType":"desktop","screen":"1920x1080"}}
                        """
                                .formatted(sessionId)),
                "web");

        // 用 JdbcTemplate 读而不是 mapper：要验的是**库里那一行长什么样**，
        // 借 mapper 读回来会顺带验一遍映射，把「写进去的是不是对」和「读出来的是不是对」搅在一起
        var row = jdbc.queryForMap("SELECT * FROM rum.rum_events WHERE session_id = ?", sessionId);

        assertThat(row.get("app")).isEqualTo("web");
        assertThat(row.get("kind")).isEqualTo("error");
        assertThat(row.get("version")).isEqualTo("abc1234");
        assertThat(row.get("route")).isEqualTo("/orders/$id");
        assertThat(row.get("user_id")).isEqualTo("u-1");
        assertThat(row.get("fingerprint")).isEqualTo("boom::at f");
        assertThat(row.get("created_at")).as("落库时刻由应用层填，不该是空").isNotNull();
        // jsonb 那一段原样躺在里面
        assertThat(String.valueOf(row.get("payload"))).contains("\"device\"").contains("点了结算");
    }

    @Test
    void 保留期删掉过期的_留下没过期的() {
        String oldSession = "it-old-" + UUID.randomUUID();
        String freshSession = "it-fresh-" + UUID.randomUUID();
        db.onDelete("DELETE FROM rum.rum_events WHERE session_id IN (?, ?)", oldSession, freshSession);

        // 直接写一行 createdAt 落在保留期之外的：走 archive 造不出过去的时间
        jdbc.update(
                """
                INSERT INTO rum.rum_events (ts, app, kind, session_id, payload, created_at)
                VALUES (NOW(), 'web', 'error', ?, '{}', NOW() - INTERVAL '30 days')
                """,
                oldSession);
        archive.append(json.readTree("{\"kind\":\"error\",\"sessionId\":\"" + freshSession + "\"}"), "web");

        int deleted = mapper.deleteBatchBefore(OffsetDateTime.now().minusDays(14), 1000);

        assertThat(deleted).as("过期那行必须被删掉").isPositive();
        assertThat(count(oldSession)).as("过期行").isZero();
        assertThat(count(freshSession)).as("未过期行").isEqualTo(1);
    }

    private int count(String sessionId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM rum.rum_events WHERE session_id = ?", Integer.class, sessionId);
        return n == null ? 0 : n;
    }
}
