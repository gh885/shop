package com.shop.platform;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/**
 * 模块边界强校验（AGENTS.md 架构规则 1/5 的落地）：
 * 跨模块访问未开放类型、模块间循环依赖、非开放内部类型引用在此失败。
 *
 * <p>跨模块只允许经事件或显式开放的命名接口（如 shop/events 的 @NamedInterface）通信；
 * common/infra 为共享模块，任何模块可引用。
 */
class ModularityTests {

    @Test
    void 校验模块边界() {
        ApplicationModules.of(ShopServerApplication.class).verify();
    }
}
