package com.shop.platform.rum.service;

import com.shop.platform.rum.RumVocabulary;
import com.shop.platform.rum.mapper.RumEvent;
import com.shop.platform.rum.mapper.RumEventMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * 明细落库：把一条事件翻译成 {@link RumEvent} 一行并追加。
 *
 * <p>它补的是这条链路一直缺的那个出口。此前事件只落到**计数与日志**上，而那两样都只回答
 * 「多少条、什么时候」——「这个错误影响了多少个会话」「把它的堆栈和面包屑给我看」一个都答不了。
 * 计数是给看板用的，明细是给排查用的，两件事。
 *
 * <p>三条口径：
 *
 * <ol>
 *   <li><b>所有文本列在写之前按列宽截断。</b>不是为了好看——消费端**不吞异常**（加工失败要重试，
 *       见 {@code RumEventConsumer}），于是一条超长字段会让插入一直失败、把整个分区卡死。
 *       截断把「值不合规」变成「值被削短」，堵死那条路。真抛出来的就只剩基础设施故障，
 *       而那才是该重试的。
 *   <li><b>客户端时间不合常理时，用接收时刻兜住，不丢这条。</b>ts 是客户端给的，能漂也能造假。
 *       丢掉整条事件是把「这个用户遇到过这个错误」一起丢了，代价远大于一个不准的时间戳；
 *       而原始值本来就躺在 {@code payload} 里，真要看它还在。
 *   <li><b>异常不外抛给谁、也不吞。</b>这个类不 catch：抛出去由消费端交给容器重试，位点没提交，丢不了。
 * </ol>
 */
@Component
@RequiredArgsConstructor
public class RumEventArchive {

    /** 客户端 ts 的合理下界：早于它的值一律当「时钟坏了/在造假」处理 */
    private static final Instant MIN_PLAUSIBLE_TS = Instant.parse("2000-01-01T00:00:00Z");

    /** 允许的未来偏移。设备时钟往前漂几秒到几分钟都正常，漂过一天就是在瞎报 */
    private static final Duration MAX_FUTURE_SKEW = Duration.ofDays(1);

    /** `kind` 里唯一从别的字段取受控名的那个 */
    private static final String KIND_FALLBACK = "fallback";

    private final RumEventMapper mapper;

    /** 追加一行。任何异常都往外走——见类注释第 3 条 */
    public void append(JsonNode event, String app) {
        mapper.insert(toRow(event, app, OffsetDateTime.now()));
    }

    /**
     * 映射本身。**独立成静态方法是为了能直接单测**：这一段的正确性靠的全是边界判断
     * （哪个字段取不到、时间怎么兜、名字从哪来），而要触发它们不必起一个库。
     *
     * @param receivedAt 落库时刻。由调用方给而不是在这里取 now——测试要能钉住它
     */
    static RumEvent toRow(JsonNode event, String app, OffsetDateTime receivedAt) {
        String kind = RumVocabulary.text(event, "kind", RumVocabulary.MAX_LABEL);
        return RumEvent.builder()
                // app 和 kind 是标签/过滤的主力，值全部来自白名单——名单外的折成 other 而不是写进去，
                // 否则一个乱发的客户端就能往索引里灌任意值
                .app(RumVocabulary.label(RumVocabulary.APPS, app))
                .kind(RumVocabulary.label(RumVocabulary.KINDS, kind))
                .ts(plausibleTs(event, receivedAt))
                .version(RumVocabulary.text(event, "version", RumVocabulary.MAX_LABEL))
                .env(RumVocabulary.text(event, "env", RumVocabulary.MAX_LABEL))
                .route(RumVocabulary.text(event, "route", RumVocabulary.MAX_LABEL))
                .sessionId(RumVocabulary.text(event, "sessionId", RumVocabulary.MAX_LABEL))
                .userId(RumVocabulary.text(event, "userId", RumVocabulary.MAX_LABEL))
                .name(controlledName(event, kind))
                .fingerprint(RumVocabulary.text(event, "fingerprint", RumVocabulary.MAX_FINGERPRINT))
                .message(RumVocabulary.text(event, "message", RumVocabulary.MAX_MESSAGE))
                // 整条原件（已脱敏）。列是从它提出来的一份副本，不是它的替代
                .payload(event.toString())
                .build();
    }

    /**
     * 受控名：一条事件「是哪一类」的那个受控取值。
     *
     * <p>它按 kind 从不同的字段取——error / performance 是 `name`，fallback 是 `source`
     * （那个事件的定义就是「没有可用的 code，只有一句兜底文案」，问「哪一类」问的正是它从哪一支取的）。
     * 合成一列而不是各留一列，是因为查询要问的是同一个问题：「这一类出现了多少次」。
     */
    private static String controlledName(JsonNode event, String kind) {
        String field = KIND_FALLBACK.equals(kind) ? "source" : "name";
        return RumVocabulary.text(event, field, RumVocabulary.MAX_LABEL);
    }

    /**
     * 客户端 ts 的可用性判断，见类注释第 2 条。
     *
     * <p>0 当作「没有」——它不是任何一个真实时刻（1970 年不会是这条链路上的合法上报时间）。
     */
    private static OffsetDateTime plausibleTs(JsonNode event, OffsetDateTime receivedAt) {
        long millis = RumVocabulary.longValue(event, "ts");
        if (millis == 0L) {
            return receivedAt;
        }
        // ofEpochMilli 对任意 long 都不抛，只是会给出很远的年份——下面那两条比较正好收住它们
        Instant instant = Instant.ofEpochMilli(millis);
        if (instant.isBefore(MIN_PLAUSIBLE_TS)
                || instant.isAfter(receivedAt.toInstant().plus(MAX_FUTURE_SKEW))) {
            return receivedAt;
        }
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
