package com.shop.platform.aftersale.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.aftersale.model.TicketAvailableAction;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 一页订单各自对应的卖家售后可执行动作——卖家订单列表行内按钮的契约来源。
 *
 * <p>为什么单独一条读接口而不塞进订单列表行：订单模块在依赖图上是 aftersale 的下游（aftersale →
 * order :: api），反向取动作会成环；动作集本来就由售后单状态机算出，归本模块出。订单行上那条
 * {@code afterSaleStatus} 只是写回投影（徽章用），不拿来推导按钮。
 *
 * <p>只回有进行中售后单（APPLYING / RETURNING）的订单：没进列表 = 这一行没有售后动作，
 * 前端按 orderId 取即可。一张订单同时至多一张进行中的单（部分唯一索引），故一单一行。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record SellerOrderTicketActions(
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) List<TicketAvailableAction> availableActions) {}
