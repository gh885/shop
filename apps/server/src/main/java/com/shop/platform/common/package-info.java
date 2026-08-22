/**
 * 共享纯包：框架无关契约（异常体系、校验、值对象、ThreadLocal Holder）。
 *
 * <p>不属于任何业务模块，经 @Modulithic(sharedModules = {"common"}) 显式登记；开放模块（OPEN），
 * 全部类型对任何业务模块可见。
 */
@org.springframework.modulith.ApplicationModule(
        displayName = "Common",
        type = org.springframework.modulith.ApplicationModule.Type.OPEN)
package com.shop.platform.common;
