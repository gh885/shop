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
     * 消费端开关。
     *
     * <p>测试上下文关掉它（见 {@code application-test.yml}）：没有 broker 时 {@code @KafkaListener}
     * 会一直重连并把警告灌满日志，而接口测试根本不关心消费这一半。默认开。
     */
    private boolean consumerEnabled;
}
