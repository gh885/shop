package com.shop.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 后端入口。
 *
 * <p>模块边界与依赖方向见 {@code docs/domain/module-map.md}，开工前要打的地基见
 * {@code docs/domain/platform-baseline.md}。业务模块按前者逐个落地，地基按后者逐项打勾。
 */
@SpringBootApplication
public class ShopServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ShopServerApplication.class, args);
    }
}
