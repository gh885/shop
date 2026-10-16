package com.shop.platform.rum;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 遥测链路自己的开关与主题名。
 *
 * <p>**值全部来自 `application.yml` 的 `shop.rum` 块，这里不设 Java 默认值。**两处都写等于
 * 制造第二个真相源；而只写 Java 默认值会更糟——`@KafkaListener` 的占位符读的是 Environment，
 * 它看不见 `@ConfigurationProperties` 的字段默认值，症状是启动就报「Could not resolve placeholder」。
 * 一个真相源（yml）＋ 缺了就在启动时报错，比一个不会出声的默认值好。
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "shop.rum")
public class RumProperties {

    /**
     * 接收端总开关。**打开着的时候这条链路才有意义；关掉时事件进得来、204 照回，但一条都不留。**
     *
     * <p>它不是「排障用的临时开关」，而是一个正当的部署状态：投递层（Kafka broker）需要单独一台机器，
     * 而那台机器还没有的时候，开着它只会让每个事件都在投递上失败——浏览器毫无感觉，
     * 唯一的痕迹是 {@code shop.rum.publish.failed} 在涨，而那条线没人配告警。
     * 那种「看着在跑、其实一条没留住」比明明白白关掉更糟。
     *
     * <p>关掉只拦接收端：上游（前端）照常发，下游（{@code RumEventConsumer}）另有关。
     * 见 {@code application-prod.yml} 的那个开关。
     */
    private boolean enabled;

    /** 事件主题名。生产者与消费者都从这里取，不许在别处再抄一份字面量 */
    private String topic;

    /**
     * 分区数。
     *
     * <p>3 是跟着分区键来的：消息按 {@code app}（web / seller / admin）分区，一端一个分区，
     * 于是同一端的事件在分区内有序、三端彼此并行。**改这个数要连同消费端并行度一起想**——
     * 分区不是越多越好，多到超过消费者数只会让一部分分区闲置。
     */
    private int partitions;

    /** 副本数。单机 broker（本机开发与当前这台 2C/1.6G）只能是 1：写 3 会让 topic 建不出来 */
    private int replicas;

    /**
     * 明细保留天数。{@link com.shop.platform.rum.infra.RumRetentionJob} 按它算截止时刻。
     *
     * <p>默认 14，**刻意与日志侧的保留期对齐**（Grafana Cloud 免费档，见 ADR 0005）：
     * 日志先没而明细还在，排查时只能看到半张脸——「这条错误当时后端回了什么」查不动了。
     * 两边同一个窗口，至少保证看到一个问题的现场是完整的。
     *
     * <p>**它不受 {@link #isEnabled} 影响**：关掉接收端只是不再收新数据，不等于要停止清理已有的。
     */
    private int retentionDays;

    /**
     * 消费端开关。
     *
     * <p>测试上下文关掉它（见 {@code application-test.yml}）：没有 broker 时 {@code @KafkaListener}
     * 会一直重连并把警告灌满日志，而接口测试根本不关心消费这一半。默认开。
     */
    private boolean consumerEnabled;
}
