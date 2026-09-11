package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 售后单时间线 —— 每个动作追加一行，append-only。取值都是 {@code name()}：
 * {@code actor} 来自 TicketActor，{@code action} 来自 TicketAction；note 记申请理由 / 回寄物流等。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("aftersale.ticket_events")
public class TicketEvent extends BaseEntity {

    /** 所属售后单，aftersale.tickets.id */
    private UUID ticketId;

    private String actor;

    private String action;

    private String note;
}
