package com.shop.platform.rum.infra;

import com.shop.platform.rum.RumCounters;
import com.shop.platform.rum.RumProperties;
import com.shop.platform.rum.service.RumEventPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/**
 * {@link RumEventPublisher} 的 Kafka 实现：投出去就返回，不等 broker 确认。
 *
 * <p><b>失败是丢，不是重试。</b>这条链路的调用方是 HTTP 线程，它对浏览器的承诺是「永远 204，且不等
 * 下游」。要让投递失败变成重试，就得让请求线程等——那等于用业务页面的延迟给遥测的可靠性买单，
 * 而遥测本身是「有则更好」的数据。所以失败走计数：{@code shop.rum.publish.failed} 在涨，
 * 就是「这段时间的遥测丢了」，界面上没有任何人会因此看到异常。
 *
 * <p>两条超时都在 yml 里（见 {@code application.yml} 的 {@code spring.kafka.producer.properties}）：
 * {@code max.block.ms} 挡住「broker 不可达时 send 阻塞 60 秒」那个默认值——那会把 Tomcat 线程
 * 按整分钟钉死。这里只负责把两种失败（同步抛与异步回调）都收成同一个计数。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class KafkaRumEventPublisher implements RumEventPublisher {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final RumProperties properties;
    private final RumCounters counters;

    @Override
    public void publish(String app, String eventJson) {
        try {
            kafkaTemplate.send(properties.getTopic(), app, eventJson).whenComplete((result, ex) -> {
                if (ex != null) {
                    reportFailure(ex);
                }
            });
        } catch (Exception ex) {
            // send() 自己也会抛：序列化失败、发送缓冲满、等 metadata 超了 max.block.ms
            reportFailure(ex);
        }
    }

    /**
     * 失败留痕。**必须留**：只计数不吭声的话，「正在丢数据」这件事除了那条曲线之外没有任何
     * 地方会说，而曲线要有人看、还得有人配告警才有用。
     *
     * <p>打**根因**而不是外层：Kafka 客户端爱把真实原因包进
     * {@code KafkaException: Failed to construct kafka producer} 这种壳里，只打外层消息
     * 等于什么都没说（这条就是调试时踩出来的）。
     */
    private void reportFailure(Throwable ex) {
        counters.publishFailed();
        Throwable root = ex;
        while (root.getCause() != null) {
            root = root.getCause();
        }
        log.warn(
                "[RUM] 投递失败，这条遥测丢了：{}: {}（外层 {}）",
                root.getClass().getSimpleName(),
                root.getMessage(),
                ex.getClass().getSimpleName());
    }
}
