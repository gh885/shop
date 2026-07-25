/**
 * 共享内核 — 被所有模块依赖
 *
 * <p>只放跨模块共享类型：UserId, Money, Address 等值对象。 不放业务逻辑，不放 Service/Mapper。
 */
@ApplicationModule(displayName = "Kernel")
package com.shop.platform.kernel;

import org.springframework.modulith.ApplicationModule;
