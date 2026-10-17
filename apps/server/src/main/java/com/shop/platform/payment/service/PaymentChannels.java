package com.shop.platform.payment.service;

import com.shop.platform.payment.gateway.PaymentGateway;
import com.shop.platform.payment.mapper.Payment;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 渠道表 —— 按 {@code payment.channel} 找到对应网关，并守住「默认渠道必须可用」这条启动闸门。
 *
 * <p>为什么在启动时就失败而不是在请求时回落：支付渠道配错或密钥缺失，静默走 MOCK 会让买家
 * 「不付钱也能把单推成已付款」，而且没人会发现——这是比启动失败严重得多的故障。
 */
@Component
public class PaymentChannels {

    private final Map<String, PaymentGateway> byChannel;

    private final String defaultChannel;

    public PaymentChannels(List<PaymentGateway> gateways, PaymentProperties properties) {
        Map<String, PaymentGateway> map = new LinkedHashMap<>();
        for (PaymentGateway gateway : gateways) {
            map.put(gateway.channel(), gateway);
        }
        this.byChannel = Map.copyOf(map);
        this.defaultChannel = properties.getChannel();

        PaymentGateway selected = this.byChannel.get(defaultChannel);
        if (selected == null) {
            throw new IllegalStateException(
                    "支付渠道 " + defaultChannel + " 未装配：检查 shop.payment.channel 与对应渠道的 enabled 配置");
        }
        if (!selected.available()) {
            throw new IllegalStateException("支付渠道 " + defaultChannel + " 已选中但不可用：检查密钥与网关地址配置");
        }
    }

    /** 当前默认渠道 */
    public PaymentGateway defaultGateway() {
        return byChannel.get(defaultChannel);
    }

    /** 按流水上的渠道找网关：确认时必须以「这笔流水当初走的渠道」为准，不能看当前默认配置 */
    public PaymentGateway of(String channel) {
        PaymentGateway gateway = byChannel.get(channel);
        if (gateway == null) {
            throw new IllegalStateException("支付流水上的渠道 " + channel + " 没有对应网关实现");
        }
        return gateway;
    }

    /**
     * MOCK 渠道的钱由收银台自己声明；其余渠道必须向渠道查询。
     *
     * <p>channel 为 null 也按 MOCK 处理：DB 列是 NOT NULL DEFAULT 'MOCK'，但内存对象 / 历史视图
     * 未必带这一列，把「没有渠道信息」当成真实渠道会去查一个不存在的网关。
     */
    public static boolean declarative(String channel) {
        return channel == null || Payment.CHANNEL_MOCK.equals(channel);
    }
}
