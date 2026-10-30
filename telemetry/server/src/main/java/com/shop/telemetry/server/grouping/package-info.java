/**
 * 分组：把 event 流压成 issue。
 *
 * <p>无 IO、无状态、无 Spring 依赖（除了 {@code @Component} 的注册）。这是本仓库唯一
 * 有资格要求"单测覆盖到分支"的模块：它的错误会变成"待办列表里多出 1000 条重复"，
 * 而不是一次报错。
 */
package com.shop.telemetry.server.grouping;
