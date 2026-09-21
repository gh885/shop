/**
 * Logistics 模块对外命名接口（跨模块同步调用）。
 *
 * <p>只有一个命令类：aftersale 在买家回寄时把「退货物流单」记进本模块
 * （{@link com.shop.platform.logistics.api.ReturnShipmentCommand}：首次 record、改单 replace 覆盖作废旧包裹）。
 * 为什么退货也要进 logistics 而不是继续留在售后单的两列字符串里：回寄包裹与正向包裹是同一件东西
 * （只是 direction 不同），轨迹的接收（推送/轮询）、去重、单调推进、买家展示全部可以复用一套；
 * 留在售后单里等于第二套物流，永远接不上真实轨迹。
 *
 * <p>方向仍是单向：aftersale → logistics::api，本模块不认识售后单。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.logistics.api;
