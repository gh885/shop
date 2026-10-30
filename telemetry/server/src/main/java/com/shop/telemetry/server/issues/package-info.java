/**
 * issue 的读模型与状态机：unresolved / resolved / ignored / regression。
 *
 * <p>状态机是"平台"和"日志搜索"的分界线：可分配、可静默、可检测回归，才叫待办。
 * 状态变更必须留下 activity 记录（谁、什么时候、为什么），否则复盘时无法回答
 * "这条为什么被忽略了"。
 */
@ApplicationModule(allowedDependencies = {"store"})
package com.shop.telemetry.server.issues;

import org.springframework.modulith.ApplicationModule;
