package com.shop.platform.payment.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/**
 * 收银台请求必须带 time_expire：渠道自己也拒收晚付款，和我们这边的关单互为双保险。
 * 比对口径是北京时间（Asia/Shanghai），与部署时区无关。
 */
class AlipayChannelTest {

    @Test
    void 收银台地址带北京时间格式的time_expire() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        KeyPair pair = generator.generateKeyPair();
        AlipayChannel channel =
                new AlipayChannel("app-id", pair.getPublic(), "https://gateway.example", null, null, (url, form) -> "");

        String url = channel.createPayment(
                new PaymentChannel.Charge("OUT-1", 12_345, "测试订单", Instant.parse("2026-10-24T12:00:00Z")));

        String decoded = URLDecoder.decode(url, StandardCharsets.UTF_8);
        // 12:00 UTC = 20:00 北京时间
        assertThat(decoded).contains("\"time_expire\":\"2026-10-24 20:00:00\"");
        assertThat(decoded).contains("\"out_trade_no\":\"OUT-1\"");
        assertThat(decoded).contains("\"total_amount\":\"123.45\"");
    }
}
