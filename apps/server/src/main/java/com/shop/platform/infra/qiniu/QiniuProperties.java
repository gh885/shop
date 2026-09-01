package com.shop.platform.infra.qiniu;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 七牛云对象存储（Kodo）配置。密钥走环境变量注入，绝不写死进代码 / 仓库。 */
@Data
@ConfigurationProperties(prefix = "shop.qiniu")
public class QiniuProperties {

    /** AccessKey（公开标识），从环境变量读，如 ${QINIU_ACCESS_KEY} */
    private String accessKey;

    /** SecretKey（签名密钥，等于密码），从环境变量读，如 ${QINIU_SECRET_KEY} */
    private String secretKey;

    /** 存储空间（bucket）名，如 xun-shop-370264 */
    private String bucket;

    /**
     * 上传域名（浏览器直传 PUT 的目的 host）。按空间所在区域填：
     * 华东 z0 = {@code upload.qiniup.com}，华北 z1 = {@code upload-z1.qiniup.com}，
     * 华南 z2 = {@code upload-z2.qiniup.com}，北美 na0 = {@code upload-na0.qiniup.com}。
     *
     * <p>以控制台「空间信息 → 创建地域」为准。
     */
    private String uploadHost = "upload-z1.qiniup.com";

    /** 公网访问域名（CDN/测试域名），拼图片 URL 用，如 https://tkowmtfov.hb-bkt.clouddn.com */
    private String publicBaseUrl;

    /** 上传凭证有效期（秒），默认 1 小时 */
    private long tokenExpirationSeconds = 3600;
}
