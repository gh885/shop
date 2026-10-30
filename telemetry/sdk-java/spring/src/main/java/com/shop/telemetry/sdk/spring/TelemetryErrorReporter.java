package com.shop.telemetry.sdk.spring;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 错误的唯一出口。
 *
 * <p>为什么不让 Filter 直接调 SDK：**上报策略（采样、脱敏、丢弃、配额）不该写进挂载点**。
 * 挂载点只负责"什么时候算错"，出口负责"这条要不要发、发成什么样"。分开之后，
 * 换传输、加本地缓冲、在测试里换成收集器，都不用动 Filter。
 */
public interface TelemetryErrorReporter {

    /**
     * @param failure 抛出的异常；被框架吞掉的情况（只有状态码）为 null
     * @param status 响应状态码，调用方保证 >= 500
     */
    void capture(HttpServletRequest request, Throwable failure, int status);
}
