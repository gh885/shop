/**
 * 框架无关的采集核心：trace 头、上下文、传输。
 *
 * <p>这里**不依赖 Spring、不依赖 Servlet**。理由：同一套逻辑要同时被 Spring 应用、
 * 定时任务、以后可能的独立转发进程使用；而 Spring 那层是要跟着 Spring 大版本走的，
 * 混在一起会让核心也被迫跟着升。
 */
package com.shop.telemetry.sdk;
