package com.shop.platform.rum.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.rum.RumVocabulary;
import com.shop.platform.rum.mapper.RumEvent;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 「一条 JSON 事件 → 一行明细」这一段。测的是**边界**，不是字段搬运——字段搬错在真库里一眼看得出来，
 * 而边界（取不到、值离谱、太长）不会报错，只会让某一行静静地缺一块或长得不对劲。
 *
 * <p>三类边界各自有代价：时间兜错 = 按时间排查时把事件放到了错误的时刻；名字取错 = 「哪一类」统计
 * 从那一类开始少算；不截断 = 插入失败 → 消费端重投 → **一条超长字段把整个分区堵死**。
 */
class RumEventArchiveTest {

    private final ObjectMapper mapper = new ObjectMapper();

    /** 固定的落库时刻，用来分辨「用的是客户端 ts」还是「兜底用了接收时刻」 */
    private static final OffsetDateTime RECEIVED_AT =
            OffsetDateTime.ofInstant(Instant.parse("2026-10-16T05:00:00Z"), ZoneOffset.UTC);

    @Test
    void 信封字段进列_payload留整条原件() {
        RumEvent row = toRow(
                """
                {"schema":"shop.fe.v1","app":"seller","version":"abc1234","env":"prod","kind":"error",
                 "name":"js_error","route":"/orders/$id","sessionId":"s-1","userId":"u-1","ts":1770000000000,
                 "message":"boom","fingerprint":"boom::at f","stack":"Error: boom"}
                """,
                "seller");

        assertThat(row.getApp()).isEqualTo("seller");
        assertThat(row.getKind()).isEqualTo("error");
        assertThat(row.getVersion()).isEqualTo("abc1234");
        assertThat(row.getEnv()).isEqualTo("prod");
        assertThat(row.getRoute()).isEqualTo("/orders/$id");
        assertThat(row.getSessionId()).isEqualTo("s-1");
        assertThat(row.getUserId()).isEqualTo("u-1");
        assertThat(row.getMessage()).isEqualTo("boom");
        // payload 是原件，不是「列没提到的部分」——提出来做列的那几个字段在里面也还在，
        // 这正是「哪天要把某个字段提成列时，历史数据还捞得回来」的底气
        assertThat(row.getPayload()).contains("\"stack\":\"Error: boom\"").contains("\"userId\":\"u-1\"");
    }

    /** app / kind 是过滤主力，名单外的值折成 other 而不是原样写进去——否则一个乱发的客户端就能灌任意值 */
    @Test
    void app与kind过白名单_名单外折成other() {
        RumEvent row = toRow("{\"app\":\"web\",\"kind\":\"not-a-kind\"}", "not-an-app");

        assertThat(row.getApp()).isEqualTo(RumVocabulary.OTHER);
        assertThat(row.getKind()).isEqualTo(RumVocabulary.OTHER);
    }

    /**
     * 受控名按 kind 从不同字段取：error / performance 是 `name`，fallback 是 `source`。
     * 取错了不会报错，只会让「哪一类」的统计从那一类开始少算。
     */
    @Test
    void 受控名按kind取不同字段() {
        assertThat(toRow("{\"kind\":\"error\",\"name\":\"blank_screen\"}", "web")
                        .getName())
                .isEqualTo("blank_screen");
        assertThat(toRow("{\"kind\":\"performance\",\"name\":\"LCP\"}", "web").getName())
                .isEqualTo("LCP");
        assertThat(toRow("{\"kind\":\"fallback\",\"source\":\"detail\",\"detail\":\"x\"}", "web")
                        .getName())
                .isEqualTo("detail");
        // fallback 没有 name 字段，取错就是从这里开始少一类
        assertThat(toRow("{\"kind\":\"fallback\",\"source\":\"status\"}", "web").getName())
                .isEqualTo("status");
        // api / route 没有受控名，是空的而不是别的什么东西
        assertThat(toRow("{\"kind\":\"api\",\"endpoint\":\"/orders/$id\"}", "web")
                        .getName())
                .isNull();
    }

    @Test
    void 合理的客户端时间照用() {
        String ts = String.valueOf(Instant.parse("2026-10-16T04:59:00Z").toEpochMilli());

        assertThat(toRow("{\"kind\":\"route\",\"ts\":" + ts + "}", "web").getTs())
                .isEqualTo(OffsetDateTime.parse("2026-10-16T04:59:00Z"));
    }

    /**
     * 客户端时间不可信时的兜底。**不丢这一条**：丢掉整条事件是把「这个用户遇到过这个错误」
     * 一起丢了，代价远大于一个不准的时间戳；原始值本来就躺在 payload 里。
     */
    @Test
    void 时间离谱时用接收时刻兜住() {
        assertThat(toRow("{\"kind\":\"route\"}", "web").getTs()).as("缺 ts").isEqualTo(RECEIVED_AT);
        assertThat(toRow("{\"kind\":\"route\",\"ts\":0}", "web").getTs())
                .as("ts=0")
                .isEqualTo(RECEIVED_AT);
        assertThat(toRow("{\"kind\":\"route\",\"ts\":\"不是数字\"}", "web").getTs())
                .as("ts 不是数字")
                .isEqualTo(RECEIVED_AT);
        assertThat(toRow("{\"kind\":\"route\",\"ts\":1000}", "web").getTs())
                .as("1970 年")
                .isEqualTo(RECEIVED_AT);
        assertThat(toRow("{\"kind\":\"route\",\"ts\":" + Long.MAX_VALUE + "}", "web")
                        .getTs())
                .as("溢出到很远的年份")
                .isEqualTo(RECEIVED_AT);
        assertThat(toRow(
                                "{\"kind\":\"route\",\"ts\":"
                                        + RECEIVED_AT.plusDays(30).toInstant().toEpochMilli() + "}",
                                "web")
                        .getTs())
                .as("未来 30 天")
                .isEqualTo(RECEIVED_AT);
    }

    /** 往前漂几秒到几分钟是真实存在的设备时钟，不该被当成异常 */
    @Test
    void 轻微的未来偏移照用() {
        Instant slightlyAhead = RECEIVED_AT.toInstant().plus(Duration.ofMinutes(5));

        assertThat(toRow("{\"kind\":\"route\",\"ts\":" + slightlyAhead.toEpochMilli() + "}", "web")
                        .getTs())
                .isEqualTo(OffsetDateTime.ofInstant(slightlyAhead, ZoneOffset.UTC));
    }

    /**
     * 超长一律截断。这条不是洁癖：消费端不吞异常，插入失败会一直重投——
     * 一条超长字段足以把整个分区堵死。
     */
    @Test
    void 超长字段按列宽截断() {
        String longMessage = "m".repeat(RumVocabulary.MAX_MESSAGE + 50);
        String longFingerprint = "f".repeat(RumVocabulary.MAX_FINGERPRINT + 50);

        RumEvent row = toRow(
                "{\"kind\":\"error\",\"message\":\"" + longMessage + "\",\"fingerprint\":\"" + longFingerprint + "\"}",
                "web");

        assertThat(row.getMessage()).hasSize(RumVocabulary.MAX_MESSAGE);
        assertThat(row.getFingerprint()).hasSize(RumVocabulary.MAX_FINGERPRINT);
        // 截断值之间的关系要在：指纹比 message 宽，是刻意的（两个只差尾巴的问题不该在存储层撞成一个）
        assertThat(RumVocabulary.MAX_FINGERPRINT).isGreaterThan(RumVocabulary.MAX_MESSAGE);
    }

    /** 客户端可以给任何类型，非字符串一律当不存在——不能让一个对象把这一格撑爆 */
    @Test
    void 非字符串字段当不存在() {
        RumEvent row = toRow("{\"kind\":\"error\",\"message\":{\"nested\":1},\"route\":[1,2]}", "web");

        assertThat(row.getMessage()).isNull();
        assertThat(row.getRoute()).isNull();
    }

    private RumEvent toRow(String body, String app) {
        JsonNode event = mapper.readTree(body);
        return RumEventArchive.toRow(event, app, RECEIVED_AT);
    }
}
