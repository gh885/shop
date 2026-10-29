package com.shop.platform.inventory.api;

import java.util.List;
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

    /**
     * 支付成功：把这一整单的预占一次推进到 committed。只推状态，不动任何科目列。
     *
     * <p>整批进、整批出，不是逐行一个 api：行集内部按库存行序（warehouse, sku）处理，
     * 两个订单以不同行序碰同一组 SKU 时，只要都走这里就不会互相持有对方要的行锁。
     */
    void commitAll(List<OrderLineRef> refs);

    /**
     * 发货出库：预占减、实物减。可异步，重复调用无副作用。
     *
     * <p><b>幂等锚点是包裹，不是订单。</b> 一个子单可以分多个包裹发，同一行会出库多次；
     * 用订单当锚点，第二个包裹会被当成重复请求吞掉。同一 {@code packageId} 重放是空操作。
     *
     * <p>数量可以小于预占量：最后一包才把预占耗完，那时预占转 {@code consumed}。
     *
     * @throws com.shop.platform.common.BusinessException 预占已被释放（货可能已经卖给别人）、
     *     或出库量超过预占量
     */
    void ship(ShipRequest request);

    /**
     * 退货入库：实物加、可售加。
     *
     * <p>只有「货真的回到仓里」才调——仅退款不入库，那批货从没离开过商家。
     * 同一 {@code rmaCaseId} 重放是空操作。
     */
    void restock(RestockRequest request);

    /** 取消 / 关单：把这一整单的预占一次放回。幂等，行序同 {@link #commitAll}。 */
    void releaseAll(List<OrderLineRef> refs);

    /**
     * 商家调整：覆盖实物与安全库存，可售由守恒式反推。
     *
     * <p><b>这是库存唯一的覆盖入口。</b> 直接 {@code UPDATE stock} 而不同步可售，会被
     * {@code ck_stock_balance} 当场拒——那道护栏就是干这个的。
     *
     * <p>批量语义，因为商家手里的操作天然是「一整张 SKU 表格」。同一 {@code requestId}
     * 重放只落一次账。
     */
    void adjustAll(AdjustRequest request);

    /** @param lineNo 下单时的报价行号，库存的幂等键是 {@code (sellerOrderId, lineNo)} */
    record OrderLineRef(UUID sellerOrderId, int lineNo) {}

    /**
     * 忘掉一个从未上架过的 SKU 的库存行。
     *
     * <p><b>只给删草稿用。</b> 有订单历史的 SKU 不会被删，也就不会走到这里。草稿允许先改库存
     * （{@code PUT /products/{spuId}/stock} 不要求 listing），删 SKU 时不清就会留下孤儿行。
     * 流水不删：它是只追加的历史。
     */
    void forgetSku(UUID skuId);
}
