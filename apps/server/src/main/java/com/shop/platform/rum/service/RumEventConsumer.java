package com.shop.platform.rum.service;

import com.shop.platform.rum.RumCounters;
import com.shop.platform.rum.RumVocabulary;
import com.shop.platform.rum.processor.RumProcessingChain;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 消费端：把队列里的事件取出来交给 {@link RumEventSink}。
 *
 * <p>异常处理的界线是这张类**唯一需要想清楚的地方**，因为两条路的重试代价完全不同：
 *
 * <ul>
 *   <li><b>解析不了的（毒消息）吞掉并计数。</b>一条反序列化失败的记录，重试一万次还是失败，
 *       重试只会把分区堵住。记一条 {@code bad_body} 然后跳过，是唯一能让分区继续往前走的选择。
 *   <li><b>加工失败的（{@link RumEventSink} 抛出来的）不吞，往外传。</b>那类失败是下游抖了
 *       （Redis 暂时不可用之类），交给容器的错误处理器按退避重试才是对的；吞掉等于
 *       「Redis 抖一下、那批事件静默消失」。位点是加工成功后才提交的，所以传出去不会丢。
 * </ul>
 *
 * <p><b>至少一次，不是恰好一次。</b>重试与重投递都会让同一条事件被加工第二次，而计数器是累加的——
 * 也就是说「加工到一半进程被杀」这类窗口里，指标会多算一次。这是选队列时就接受的代价
 * （要消掉它得给事件一个可去重的 id，那是信封契约的改动，见 frontend-monitoring.md 契约 1）。
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(name = "shop.rum.consumer-enabled", havingValue = "true", matchIfMissing = true)
public class RumEventConsumer {

    private final ObjectMapper objectMapper;
    private final RumProcessingChain chain;
    private final RumEventSink sink;
    private final RumCounters counters;

    @KafkaListener(topics = "${shop.rum.topic}")
    public void onEvent(ConsumerRecord<String, String> record) {
        JsonNode event;
        try {
            event = objectMapper.readTree(record.value());
        } catch (Exception ex) {
            // 毒消息：见类注释第一条。不打堆栈——对方的格式错不是我们的故障
            counters.rejected("bad_body");
            return;
        }
        if (event == null || !event.isObject()) {
            counters.rejected("not_object");
            return;
        }
        if (!RumVocabulary.SCHEMA.equals(RumVocabulary.text(event, "schema", RumVocabulary.MAX_LABEL))) {
            // 认不出的信封**不丢、只计数**。丢它的收益是「不处理看不懂的字段」，代价是
            // 「前端先发版、后端后发版」那个窗口里的遥测全没了——而那个窗口恰恰是最需要现场的时候
            // （正在发布）。而 v1 的读法是一组 path() 取值，多出来的字段本就不影响它读到共享字段。
            counters.rejected("schema_unknown");
        }
        // 加工链之后才交落点：它可能改写（脱敏、路径归一）也可能丢弃这条
        chain.run(event)
                .ifPresent(processed ->
                        // app 取自消息键：它由接收端定、已过白名单，是分区键而不是事件体内的自述字段
                        sink.accept(processed, RumVocabulary.label(RumVocabulary.APPS, record.key())));
    }
}
