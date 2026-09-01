package com.shop.platform.infra.qiniu;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 七牛云上传能力装配。Ak/Sk 未配置时 QiniuClient 照常创建（应用不因缺密钥而启动失败），调用签发凭证时才校验。 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(QiniuProperties.class)
public class QiniuConfig {

    @Bean
    QiniuClient qiniuClient(QiniuProperties props) {
        return new QiniuClient(props);
    }
}
