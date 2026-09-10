package com.shop.platform.logistics;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.logistics.infra.kdniao.KdniaoSign;
import org.junit.jupiter.api.Test;

/**
 * 推送验签：这是推送端点唯一的安全边界（匿名可达），所以"什么能过、什么不能过"必须逐条钉死。
 */
class KdniaoSignTest {

    private static final String APP_KEY = "test-app-key";

    private static final String PAYLOAD = "{\"LogisticCode\":\"SF123\",\"State\":\"3\"}";

    @Test
    void 自己的签名能通过() {
        assertThat(KdniaoSign.verify(PAYLOAD, KdniaoSign.sign(PAYLOAD, APP_KEY), APP_KEY))
                .isTrue();
    }

    @Test
    void 报文被改过_拒绝() {
        String sign = KdniaoSign.sign(PAYLOAD, APP_KEY);
        String tampered = PAYLOAD.replace("SF123", "SF999");

        assertThat(KdniaoSign.verify(tampered, sign, APP_KEY)).isFalse();
    }

    @Test
    void 签名被改过_拒绝() {
        assertThat(KdniaoSign.verify(PAYLOAD, "ZmFrZS1zaWduYXR1cmU=", APP_KEY)).isFalse();
    }

    @Test
    void 换成别的密钥签的_拒绝() {
        assertThat(KdniaoSign.verify(PAYLOAD, KdniaoSign.sign(PAYLOAD, "another-key"), APP_KEY))
                .isFalse();
    }

    @Test
    void 密钥或报文缺失_一律拒绝_不failOpen() {
        assertThat(KdniaoSign.verify(PAYLOAD, KdniaoSign.sign(PAYLOAD, APP_KEY), ""))
                .isFalse();
        assertThat(KdniaoSign.verify(PAYLOAD, null, APP_KEY)).isFalse();
        assertThat(KdniaoSign.verify(null, KdniaoSign.sign(PAYLOAD, APP_KEY), APP_KEY))
                .isFalse();
    }
}
