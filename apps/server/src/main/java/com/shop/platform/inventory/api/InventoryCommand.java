package com.shop.platform.inventory.api;

import java.util.UUID;

/**
 * 库存对外的同步命令。trade 在自己的下单事务里调用，不监听事件。
 *
 * <p>为什么是 api 而不是事件：预占必须和插单同一个事务。走事件就是"下单成功了但货没锁住"，
 * 中间那段时间别人还能买，那就是超卖的定义。
 *
 * <p>所有方法都要求调用方已经在一个事务里；本模块不自己开事务边界。
 */
public interface InventoryCommand {

    /**
     * 下单预占。同一 {@code (sellerOrderId, lineNo)} 只能预占一次，重复调用撞唯一键。
     *
     * @throws com.shop.platform.common.BusinessException 库存不足时抛 {@code INSUFFICIENT_STOCK}，
     *     调用方据此回滚整个下单事务
     */
    void reserve(ReserveRequest request);

    /** 支付成功：只推预占状态，不动任何科目列。预占已经被放掉时抛异常，调用方应触发整单退款。 */
    void commit(UUID sellerOrderId, int lineNo);

    /** 发货：预占减、实物减。可异步，重复调用无副作用。 */
    void ship(UUID sellerOrderId, int lineNo);

    /** 取消 / 退款未发货：预占减、可售加。必须幂等。 */
    void release(UUID sellerOrderId, int lineNo);
}
