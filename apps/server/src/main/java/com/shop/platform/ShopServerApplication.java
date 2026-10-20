package com.shop.platform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.modulith.Modulithic;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 后端入口。
 *
 * <p>模块边界与依赖方向见 {@code docs/domain/module-map.md}，开工前要打的地基见
 * {@code docs/domain/platform-baseline.md}。
 *
 * <p>{@code sharedModules} 声明哪几个顶层包是共享包而不是模块：它们不参与 {@code allowedDependencies}
 * 的登记，否则三十多个模块都要各自重复一遍 {@code common :: …}。按 module-map 第 8.3 节，只有
 * {@code common} 和 {@code infra} 是共享包；{@code audit} 有自己的表，所以它是模块。
 */
@SpringBootApplication
@EnableScheduling
@Modulithic(sharedModules = {"common", "infra"})
public class ShopServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ShopServerApplication.class, args);
    }
}
