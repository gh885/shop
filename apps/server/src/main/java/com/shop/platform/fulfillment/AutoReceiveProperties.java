package com.shop.platform.fulfillment;

import java.time.Duration;
import java.time.Instant;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 自动确认收货的宽限期。
 *
 * <p>单一真相源：{@link AutoReceiveJob} 的扫描面与 {@code PackageView.autoReceiveAt}（买家端
 * 「N 天后自动确认」倒计时）都从这一个数算——两处各读一份配置，宽限一改展示就对不上。
 *
 * @param after 发货后经过这么久还没签收，系统替买家确认。P10D 不是 PT10D：Duration.parse
 *     的天数在 T 前
 * @param enabled 关掉 = 没有自动确认（买家不点订单永远停在 shipped，商家资金不解冻），仅排查用
 */
@ConfigurationProperties("shop.fulfillment.auto-receive")
public record AutoReceiveProperties(Duration after, boolean enabled) {

    public AutoReceiveProperties {
        after = after == null ? Duration.ofDays(10) : after;
    }

    /** 发货时刻 → 自动确认时刻。签收判断不在这里：调用方自己看 status。 */
    public Instant autoReceiveAt(Instant shippedAt) {
        return shippedAt.plus(after);
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AutoReceiveProperties.class)
    static class Config {}
}
