/**
 * Envelope 协议层：唯一同时被 relay（接收）与 sdk（产出）依赖的模块。
 *
 * <p>这里只放"协议怎么切、怎么拼"，不放"业务怎么理解"。判据：一段代码如果要知道
 * issue / 分组 / 告警 / 项目配置，它就不属于这个包。
 */
package com.shop.telemetry.proto;
