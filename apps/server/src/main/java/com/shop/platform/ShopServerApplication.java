package com.shop.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.modulith.Modulithic;

// common/infra 为共享纯包（无 @ApplicationModule），显式登记为 sharedModules，任何模块可引用
@Modulithic(sharedModules = {"common", "infra"})
// 全局扫描 @ConfigurationProperties：免去每个 Properties 都要找一个 @Configuration 挂靠
// @EnableConfigurationProperties——那种挂靠会把配置类的存在性绑到无关的模块开关上
@ConfigurationPropertiesScan
@SpringBootApplication
public class ShopServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ShopServerApplication.class, args);
    }
}
