/**
 * 跨模块的最小公共物：Clock、ID 生成、schema 校验器入口。
 *
 * <p>声明为 OPEN 是明确的取舍：它**只能放无状态工具**。一旦出现"业务概念"，
 * 说明放错了位置——那东西应该属于某个具体模块的 {@code api/}。
 */
@ApplicationModule(type = ApplicationModule.Type.OPEN)
package com.shop.telemetry.server.shared;

import org.springframework.modulith.ApplicationModule;
