package com.shop.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.modulith.Modulithic;

// common/infra 为共享纯包（无 @ApplicationModule），显式登记为 sharedModules，任何模块可引用
@Modulithic(sharedModules = {"common", "infra"})
@SpringBootApplication
public class ShopServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ShopServerApplication.class, args);
    }
}
