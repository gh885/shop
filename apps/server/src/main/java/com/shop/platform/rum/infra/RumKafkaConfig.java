package com.shop.platform.rum.infra;

import com.shop.platform.rum.RumProperties;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

/**
 * 主题声明。生产者与消费者都按 {@link RumProperties#getTopic()} 走，这里把那个名字落到 broker 上。
 *
 * <p>用 {@code NewTopic} bean 而不是让 broker 的 {@code auto.create.topics.enable} 兜底：
 * 自动创建出来的主题拿的是 broker 的默认分区数（不是我们要的 3），而且**创建这件事发生在
 * 第一条消息投递时**——那时才失败，排查会从「应用启动」跑到「第一条遥测」，白绕一圈。
 */
@Configuration
@EnableConfigurationProperties(RumProperties.class)
public class RumKafkaConfig {

    @Bean
    NewTopic rumEventsTopic(RumProperties properties) {
        return TopicBuilder.name(properties.getTopic())
                .partitions(properties.getPartitions())
                .replicas(properties.getReplicas())
                .build();
    }
}
