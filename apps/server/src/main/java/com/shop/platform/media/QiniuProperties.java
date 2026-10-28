package com.shop.platform.media;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 七牛 Kodo 直传的接入配置。密钥只进 {@code apps/server/.env}（gitignored）或部署平台环境变量。
 *
 * @param accessKey 七牛 Access Key
 * @param secretKey 七牛 Secret Key
 * @param bucket 空间名；上传凭证绑定到这个空间
 * @param uploadHost 直传域名（如 {@code upload-z1.qiniup.com}），按空间所在区域选
 * @param publicBaseUrl 空间的公网访问基址；入库存相对 key，展示时用它拼完整 URL——换域名不坏历史数据
 */
@ConfigurationProperties("shop.media.qiniu")
public record QiniuProperties(
        String accessKey, String secretKey, String bucket, String uploadHost, String publicBaseUrl) {

    /** 五项任缺其一，直传通道就没法工作；凭证端点据此整体拒绝，而不是签出一张没人能用的凭证。 */
    public boolean configured() {
        return notBlank(accessKey)
                && notBlank(secretKey)
                && notBlank(bucket)
                && notBlank(uploadHost)
                && notBlank(publicBaseUrl);
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    @Configuration
    @EnableConfigurationProperties(QiniuProperties.class)
    static class Registration {}
}
