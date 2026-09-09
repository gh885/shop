package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 售后单时间线 —— 每个动作追加一行，append-only。取值都是 {@code name()}：
 * {@code actor} 来自 TicketActor，{@code action} 来自 TicketAction；note 记申请理由 / 回寄物流等。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("aftersale.ticket_events")
public class TicketEvent {

    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 所属售后单，aftersale.tickets.id */
    private UUID ticketId;

    private String actor;

    private String action;

    private String note;

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
}
