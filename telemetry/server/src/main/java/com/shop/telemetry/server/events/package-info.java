/**
 * 单条事件的读路径：详情页要的东西（堆栈、breadcrumbs、contexts、关联的 trace）。
 *
 * <p>和 {@code issues} 分开的理由：一个是聚合视图（可缓存、可排序），一个是点查原文
 * （大对象、不参与列表）。合成一个模块后，列表分页会不小心把 payload 一起拖出来。
 */
@ApplicationModule(allowedDependencies = {"store", "symbolication"})
package com.shop.telemetry.server.events;

import org.springframework.modulith.ApplicationModule;
