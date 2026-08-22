/**
 * 共享纯包：跨模块技术适配（JWT、限流、Filter、MyBatis 配置、problem+json 出口）。
 *
 * <p>不属于任何业务模块，经 @Modulithic(sharedModules = {"infra"}) 显式登记；开放模块（OPEN），
 * 全部类型对任何业务模块可见。
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Infra",
        type = org.springframework.modulith.ApplicationModule.Type.OPEN)
package com.shop.platform.infra;
