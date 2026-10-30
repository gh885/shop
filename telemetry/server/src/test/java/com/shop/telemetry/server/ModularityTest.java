package com.shop.telemetry.server;

import static org.junit.jupiter.api.Assertions.assertFalse;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/**
 * 模块边界不靠 review，靠这条测试。
 *
 * <p>它和 shop 后端的 {@code ModularityTest} 是两回事：那份管业务模块，这份管平台。
 * 刻意不放进 shop 的 reactor，否则两边会互相解锁对方的违规。
 */
class ModularityTest {

    private static final ApplicationModules MODULES = ApplicationModules.of(ServerRoot.class);

    @Test
    void moduleBoundariesHold() {
        assertFalse(MODULES.stream().toList().isEmpty(), "一个模块都没识别到，说明根包选错了");
        MODULES.verify();
    }
}
