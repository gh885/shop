/**
 * 后端采集的挂载点。**全部是我们自己的代码**，不引上游 Spring starter。
 *
 * <p>理由：{@code sentry-spring-boot-starter-*} 受 Spring 大版本约束，shop 侧跟着 Boot 大版本走，
 * 被 starter 卡住等于卡住整条采集链。只依赖框架无关的 {@code io.sentry:sentry} core，
 * 自己写下面这几个薄类。
 *
 * <p>五个挂载点，**三个已落地**（web / async / jdbc），余下两个按里程碑加，不建空壳：
 *
 * <table>
 *   <caption>挂载点</caption>
 *   <tr><th>位置</th><th>解决什么</th></tr>
 *   <tr><td>{@link com.shop.telemetry.sdk.spring.TelemetryWebFilter}</td>
 *       <td>请求级 scope、链路头进出、5xx 与 4xx 分流</td></tr>
 *   <tr><td>{@link com.shop.telemetry.sdk.spring.TelemetryTaskDecorator}</td>
 *       <td>线程池里丢父 span（{@code @Async} 断链的头号原因）</td></tr>
 *   <tr><td>mdc</td><td>trace_id 进日志（本 Filter 已带）</td></tr>
 *   <tr><td>{@link com.shop.telemetry.sdk.spring.TelemetryDataSource}</td>
 *       <td>SQL 耗时 span（包 DataSource：MyBatis / JdbcClient / JPA 一次覆盖）</td></tr>
 *   <tr><td>rx</td><td>RestClient / WebClient 出站 span 与下游头传递（未做）</td></tr>
 * </table>
 */
package com.shop.telemetry.sdk.spring;
