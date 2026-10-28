package com.shop.platform.logistics;

import java.util.Map;
import java.util.Optional;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 轨迹推送的密钥。
 *
 * <p><b>为什么按承运商分钥。</b>推送口能推进包裹到"已签收"并触发结算解冻，一把全局钥匙意味着
 * 任何一家承运商的密钥泄漏都要全渠道轮换，而且事后无法判断"这条推送是谁发来的"。
 * 分钥之后吊销是局部的，审计也能指认来源。
 *
 * @param pushSecret 兜底密钥，所有没有单独配置的承运商都用它。留空表示这些承运商整体拒绝
 * @param carriers 按承运商码（{@code sf} / {@code zto} …，小写）单独配的密钥。有则覆盖 {@code pushSecret}
 */
@ConfigurationProperties("shop.logistics")
public record LogisticsProperties(String pushSecret, Map<String, String> carriers) {

    public LogisticsProperties {
        carriers = carriers == null ? Map.of() : Map.copyOf(carriers);
    }

    /**
     * 这个承运商实际用哪把钥匙。
     *
     * <p><b>fail closed 是这里唯一的失败方式</b>：没配就返回空，调用方据此拒收全部推送。
     * "没配钥匙时放行"不是一种可选项——那等于给这条打钱按钮拆掉锁。
     */
    public Optional<String> secretOf(String carrierCode) {
        String specific = carrierCode == null ? null : carriers.get(carrierCode);
        if (specific != null && !specific.isBlank()) {
            return Optional.of(specific);
        }
        return pushSecret == null || pushSecret.isBlank() ? Optional.empty() : Optional.of(pushSecret);
    }

    @Configuration
    @EnableConfigurationProperties(LogisticsProperties.class)
    static class Registration {}
}
