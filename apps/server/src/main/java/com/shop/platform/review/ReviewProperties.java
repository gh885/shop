package com.shop.platform.review;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 评价窗口。
 *
 * @param window 订单完结后这么久内可评价，过期自然关闭（京东口径：不做系统默认好评，
 *     没有真实使用体验的分只会稀释评分的可信度）
 * @param appendWindow 评价发布后这么久内可追评一次
 */
@ConfigurationProperties("shop.review")
public record ReviewProperties(Duration window, Duration appendWindow) {

    public ReviewProperties {
        window = window == null ? Duration.ofDays(15) : window;
        appendWindow = appendWindow == null ? Duration.ofDays(90) : appendWindow;
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ReviewProperties.class)
    static class Config {}
}
