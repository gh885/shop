package com.shop.platform.clearing.api;

import java.util.UUID;

/**
 * 资金侧对外的同步命令。**只有售后冻结需要**，其它模块都不该直接动账。
 *
 * <p>为什么冻结必须是同步命令：售后单一旦落库，钱就必须立刻冻上。走事件的话，
 * 中间那段时间结算任务可能刚好跑过去，把钱打给商家——退款就只能回头要钱。
 */
public interface ClearingCommand {

    /**
     * 冻结：这笔售后可能要退的钱，先从商家可用余额里划走。
     *
     * <p>冻的是<b>商家净额部分</b>，不是退款总额——佣金那部分是平台的，不该占商家的额度。
     * 比例按该子单 {@code net : payableAmount} 算，和冲销用的是同一套。
     *
     * @param refundAmount 本次售后申请的退款总额；金额拆分由 clearing 自己算，
     *     调用方传总额就好，别让它也算一遍
     */
    void hold(UUID caseId, UUID sellerOrderId, long refundAmount, String currency);

    /**
     * 解冻：售后撤销或被拒，钱原路退回（当初从 pending 冻的就回 pending）。
     *
     * <p>退款成功不调这个——那条路走冲销，钱直接从 held 出去。
     */
    void releaseHold(UUID caseId);
}
