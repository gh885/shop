/**
 * Aftersale 模块对外命名接口：补偿命令（{@code CompensationCommand}）。
 *
 * <p>补偿是「货留买家、只退钱」的第三条退款线（§6.3），没有买家入口、也没有卖家工作台的常规按钮——
 * 它由运营/客服的处置流程发起（本期只有内部命令，不暴露 HTTP 端点）。命令仍然走退款单：
 * 状态机、执行记录、重试与账本与其他退款完全同一条路，不在模型里开第二种钱。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.aftersale.api;
