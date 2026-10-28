package com.shop.platform.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * 用真实 {@code Auth} 签一张凭证的回归护栏：qiniu-java-sdk 被排掉了 okhttp，只留本地签名 API——
 * 哪天 SDK 把签名路径改到需要 okhttp，这张凭证就会签不出来，这里第一时间红。
 */
class QiniuClientTest {

    private final QiniuProperties properties =
            new QiniuProperties("test-ak", "test-sk", "test-bucket", "upload-z1.qiniup.com", "http://cdn.example.com/");

    private final QiniuClient client = new QiniuClient(properties);

    @Test
    void ticketCarriesUploadTargetBoundKeyAndPublicUrl() {
        QiniuClient.ImageTicket ticket = client.issue("jpg");

        assertThat(ticket.uploadUrl()).isEqualTo("https://upload-z1.qiniup.com");
        // 七牛上传凭证的形状是 AK:sign——首段必须是我们的 Access Key，说明确实走了本地签名
        assertThat(ticket.token()).startsWith("test-ak:");
        assertThat(ticket.key()).matches("product/[0-9a-f-]{36}\\.jpg");
        // 入库存相对 key，展示拼 publicBaseUrl；配置里的尾斜杠要被吃掉，不能出现双斜杠
        assertThat(ticket.url()).isEqualTo("http://cdn.example.com/" + ticket.key());
        assertThat(ticket.expiresIn()).isEqualTo(QiniuClient.TOKEN_TTL.toSeconds());
    }

    @Test
    void extIsUsedVerbatimAsKeySuffix() {
        assertThat(client.issue("webp").key()).endsWith(".webp");
    }

    @Test
    void unconfiguredClientRefusesToSign() {
        var unconfigured = new QiniuClient(new QiniuProperties("", "", "bucket", "host", "base"));
        assertThat(unconfigured.configured()).isFalse();
        assertThatThrownBy(() -> unconfigured.issue("jpg")).isInstanceOf(IllegalStateException.class);
    }
}
