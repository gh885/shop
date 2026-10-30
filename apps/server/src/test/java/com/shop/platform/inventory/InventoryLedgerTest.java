package com.shop.platform.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.inventory.api.AdjustRequest;
import com.shop.platform.inventory.api.InventoryCommand;
import com.shop.platform.inventory.api.InventoryQuery;
import com.shop.platform.inventory.api.ReserveRequest;
import com.shop.platform.inventory.api.RestockRequest;
import com.shop.platform.inventory.api.ShipRequest;
import com.shop.platform.testsupport.IntegrationTest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 库存的六条不变式与账本护栏。
 *
 * <p>这个类守的是 {@code docs/domain/inventory.md} §2.4 与 §6 的验收口径——那些条目在文档里
 * 写明"实测"，就必须有一个能跑的用例对应，否则那句话只是愿望。
 *
 * <p>每个用例手写 {@code inventory.stock} 的初始行而不用下单链路：这里测的是账本本身，
 * 拉上 trade/pricing/payment 只会让失败原因变模糊。
 */
class InventoryLedgerTest extends IntegrationTest {

    private static final UUID WAREHOUSE = new UUID(0L, 0L);

    @Autowired
    private InventoryCommand inventory;

    @Autowired
    private InventoryQuery queries;

    // —— 预占：不超卖 ——

    /**
     * 文档 §6 的验收口径：200 并发抢 100 件，成功数恰好 100。
     *
     * <p>守的是"可售量只能条件更新递减"这条不变式。任何一处写成先查后改，
     * 这个用例就会超卖，而超卖在真实环境里是钱。
     */
    @Test
    void 两百并发抢一百件_恰好成功一百次() {
        UUID sku = seedStock(100, 0);
        UUID merchant = merchantOf(sku);
        int threads = 200;

        AtomicInteger ok = new AtomicInteger();
        AtomicInteger insufficient = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(32);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>(threads);
        for (int i = 0; i < threads; i++) {
            int lineNo = i + 1;
            futures.add(pool.submit((Callable<Void>) () -> {
                start.await();
                UUID sellerOrderId = Ids.newId();
                try {
                    inventory.reserve(new ReserveRequest(
                            Ids.newId(),
                            sellerOrderId,
                            List.of(new ReserveRequest.Line(sku, merchant, lineNo, 1)),
                            Instant.now().plusSeconds(600)));
                    ok.incrementAndGet();
                } catch (BusinessException e) {
                    assertThat(e.getCode()).isEqualTo(ErrorCodes.INSUFFICIENT_STOCK);
                    insufficient.incrementAndGet();
                }
                return null;
            }));
        }
        start.countDown();
        futures.forEach(future -> {
            try {
                future.get();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        pool.shutdown();

        assertThat(ok.get()).isEqualTo(100);
        assertThat(insufficient.get()).isEqualTo(100);
        assertThat(availableToPromise(sku)).isZero();
        assertThat(reserved(sku)).isEqualTo(100);
        // 每一次成功的预占都必须有一条流水：没有流水，账实对不上时只能猜
        assertThat(count("reserve", sku)).isEqualTo(100);
    }

    /** 同一 (sellerOrderId, lineNo) 预占两次：撞唯一键，不是再扣一次。 */
    @Test
    void 同一行重复预占_撞唯一键且只扣一次() {
        UUID sku = seedStock(10, 0);
        UUID merchant = merchantOf(sku);
        UUID orderGroup = Ids.newId();
        UUID sellerOrder = Ids.newId();
        ReserveRequest request = new ReserveRequest(
                orderGroup,
                sellerOrder,
                List.of(new ReserveRequest.Line(sku, merchant, 1, 3)),
                Instant.now().plusSeconds(600));

        inventory.reserve(request);
        assertThatThrownBy(() -> inventory.reserve(request)).isInstanceOf(BusinessException.class);

        assertThat(availableToPromise(sku)).isEqualTo(7);
        assertThat(count("reserve", sku)).isEqualTo(1);
    }

    // —— 释放：幂等 ——

    /** 文档 §6 的第二条：同一释放请求打两次，库存只加一次。 */
    @Test
    void 同一释放打两次_可售只加一次() {
        UUID sku = seedStock(10, 0);
        UUID merchant = merchantOf(sku);
        UUID sellerOrder = Ids.newId();
        inventory.reserve(new ReserveRequest(
                Ids.newId(),
                sellerOrder,
                List.of(new ReserveRequest.Line(sku, merchant, 1, 4)),
                Instant.now().plusSeconds(600)));
        assertThat(availableToPromise(sku)).isEqualTo(6);

        List<InventoryCommand.OrderLineRef> refs = List.of(new InventoryCommand.OrderLineRef(sellerOrder, 1));
        inventory.releaseAll(refs);
        inventory.releaseAll(refs);

        assertThat(availableToPromise(sku)).isEqualTo(10);
        assertThat(reserved(sku)).isZero();
        assertThat(count("release", sku)).isEqualTo(1);
    }

    // —— 出库：分批发货 ——

    /**
     * 分批发货：3 件分两个包裹（2 + 1），只有最后一包才把预占耗完。
     *
     * <p>守的是 P0-1 的那条改造：幂等锚点是包裹而不是订单。用订单当锚点，
     * 第二个包裹会被当成重复请求吞掉——货发出去了，账上还挂着两件预占。
     */
    @Test
    void 三件分两个包裹发_最后一包才转consumed() {
        UUID sku = seedStock(10, 0);
        UUID merchant = merchantOf(sku);
        UUID sellerOrder = Ids.newId();
        inventory.reserve(new ReserveRequest(
                Ids.newId(),
                sellerOrder,
                List.of(new ReserveRequest.Line(sku, merchant, 1, 3)),
                Instant.now().plusSeconds(600)));
        inventory.commitAll(List.of(new InventoryCommand.OrderLineRef(sellerOrder, 1)));

        UUID firstPackage = Ids.newId();
        inventory.ship(new ShipRequest(sellerOrder, firstPackage, List.of(new ShipRequest.Line(1, 2))));

        assertThat(onHand(sku)).isEqualTo(8);
        assertThat(reserved(sku)).isEqualTo(1);
        assertThat(reservationStatus(sellerOrder, 1)).isEqualTo("committed");
        assertThat(shippedQuantity(sellerOrder, 1)).isEqualTo(2);

        UUID secondPackage = Ids.newId();
        inventory.ship(new ShipRequest(sellerOrder, secondPackage, List.of(new ShipRequest.Line(1, 1))));

        assertThat(onHand(sku)).isEqualTo(7);
        assertThat(reserved(sku)).isZero();
        assertThat(reservationStatus(sellerOrder, 1)).isEqualTo("consumed");
        assertThat(count("ship", sku)).isEqualTo(2);
    }

    /** 同一包裹重放：只付一次账。这是渠道重推和任务重跑的现实。 */
    @Test
    void 同一包裹重放_实物只减一次() {
        UUID sku = seedStock(10, 0);
        UUID merchant = merchantOf(sku);
        UUID sellerOrder = Ids.newId();
        inventory.reserve(new ReserveRequest(
                Ids.newId(),
                sellerOrder,
                List.of(new ReserveRequest.Line(sku, merchant, 1, 2)),
                Instant.now().plusSeconds(600)));
        inventory.commitAll(List.of(new InventoryCommand.OrderLineRef(sellerOrder, 1)));

        ShipRequest request = new ShipRequest(sellerOrder, Ids.newId(), List.of(new ShipRequest.Line(1, 2)));
        inventory.ship(request);
        inventory.ship(request);

        assertThat(onHand(sku)).isEqualTo(8);
        assertThat(count("ship", sku)).isEqualTo(1);
    }

    /** 未付款就发货：拒绝，而不是让可售凭空多出来。 */
    @Test
    void 预占未确认不能出库() {
        UUID sku = seedStock(10, 0);
        UUID merchant = merchantOf(sku);
        UUID sellerOrder = Ids.newId();
        inventory.reserve(new ReserveRequest(
                Ids.newId(),
                sellerOrder,
                List.of(new ReserveRequest.Line(sku, merchant, 1, 1)),
                Instant.now().plusSeconds(600)));

        assertThatThrownBy(() ->
                        inventory.ship(new ShipRequest(sellerOrder, Ids.newId(), List.of(new ShipRequest.Line(1, 1)))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("预占还没确认");
        assertThat(onHand(sku)).isEqualTo(10);
    }

    /** 超发：出库量超过预占量，拒绝。 */
    @Test
    void 出库量超过预占量被拒() {
        UUID sku = seedStock(10, 0);
        UUID merchant = merchantOf(sku);
        UUID sellerOrder = Ids.newId();
        inventory.reserve(new ReserveRequest(
                Ids.newId(),
                sellerOrder,
                List.of(new ReserveRequest.Line(sku, merchant, 1, 1)),
                Instant.now().plusSeconds(600)));
        inventory.commitAll(List.of(new InventoryCommand.OrderLineRef(sellerOrder, 1)));

        assertThatThrownBy(() ->
                        inventory.ship(new ShipRequest(sellerOrder, Ids.newId(), List.of(new ShipRequest.Line(1, 2)))))
                .isInstanceOf(BusinessException.class);
        assertThat(onHand(sku)).isEqualTo(10);
    }

    // —— 回补 ——

    /** 退货入库：实物加、可售加，可售必须跟着加——只加实物会被守恒式当场拒。 */
    @Test
    void 退货入库_实物与可售同时加且幂等() {
        UUID sku = seedStock(5, 0);
        UUID rmaCaseId = Ids.newId();
        RestockRequest request =
                new RestockRequest(rmaCaseId, merchantOf(sku), List.of(new RestockRequest.Line(sku, 1, 2)));

        inventory.restock(request);
        inventory.restock(request);

        assertThat(onHand(sku)).isEqualTo(7);
        assertThat(availableToPromise(sku)).isEqualTo(7);
        assertThat(count("restock", sku)).isEqualTo(1);
    }

    // —— 调整 ——

    /** 首次调整建档：可售 = 实物 − 安全库存，守恒式一条都不许破。 */
    @Test
    void 首次调整建档_可售等于实物减安全库存() {
        UUID sku = Ids.newId();
        inventory.adjustAll(
                new AdjustRequest(Ids.newId(), Ids.newId(), List.of(new AdjustRequest.Line(sku, 1, 100, 10))));

        assertThat(onHand(sku)).isEqualTo(100);
        assertThat(availableToPromise(sku)).isEqualTo(90);
        assertThat(reserved(sku)).isZero();
        assertThat(safety(sku)).isEqualTo(10);
    }

    /**
     * 调整到实物低于已预占：可售变负，<b>但不被拒</b>。
     *
     * <p>这是 {@code inventory.md} §2.2 的立场：负可售不是 bug，是一个要被看见的状态。
     * 拦住它，商家就没法把真实数字填进来，只会逼人填一个假数字。
     */
    @Test
    void 调整到低于预占_可售为负且不被拒() {
        UUID sku = seedStock(10, 0);
        UUID merchant = merchantOf(sku);
        inventory.reserve(new ReserveRequest(
                Ids.newId(),
                Ids.newId(),
                List.of(new ReserveRequest.Line(sku, merchant, 1, 6)),
                Instant.now().plusSeconds(600)));

        // 商家报"其实只有 3 件"：可售 = 3 - 6 - 0 = -3，账上已经超卖
        inventory.adjustAll(new AdjustRequest(Ids.newId(), merchant, List.of(new AdjustRequest.Line(sku, 1, 3, 0))));

        assertThat(onHand(sku)).isEqualTo(3);
        assertThat(availableToPromise(sku)).isEqualTo(-3);
    }

    /** 同一 requestId 重放：只落一遍账。批量调整几百行时，重试必须整批空操作。 */
    @Test
    void 同一requestId重放_只记一条流水() {
        UUID sku = seedStock(10, 0);
        UUID merchant = merchantOf(sku);
        AdjustRequest request =
                new AdjustRequest(Ids.newId(), merchant, List.of(new AdjustRequest.Line(sku, 1, 20, 0)));

        inventory.adjustAll(request);
        inventory.adjustAll(request);

        assertThat(onHand(sku)).isEqualTo(20);
        assertThat(count("adjust", sku)).isEqualTo(1);
    }

    /** 别人的 SKU 改不了。归属不是"先查后比对"，是 SQL 里就没有这一行。 */
    @Test
    void 改别人的库存是404() {
        UUID sku = seedStock(10, 0);
        assertThatThrownBy(() -> inventory.adjustAll(
                        new AdjustRequest(Ids.newId(), Ids.newId(), List.of(new AdjustRequest.Line(sku, 1, 99, 0)))))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(404);
    }

    // —— 库护栏 ——

    /**
     * {@code ck_stock_balance}：故意写一个不平的行会被当场拒。
     *
     * <p>这道护栏是整个设计的核心——任何一次漏加可售、重复扣预占、调整总量没同步可售，
     * 都在写下的那一刻被拒，而不是等三个月后对账才发现。
     */
    @Test
    void 守恒式不平的写入被数据库拒绝() {
        UUID sku = seedStock(10, 0);
        assertThatThrownBy(() -> jdbc.update(
                        "UPDATE inventory.stock SET available_to_promise = available_to_promise - 1 WHERE sku_id = ?",
                        sku))
                .hasMessageContaining("ck_stock_balance");
    }

    /** {@code stock_ledger} 只追加：能被 UPDATE，就等于没有流水。 */
    @Test
    void 流水不可修改() {
        UUID sku = seedStock(10, 0);
        inventory.reserve(new ReserveRequest(
                Ids.newId(),
                Ids.newId(),
                List.of(new ReserveRequest.Line(sku, merchantOf(sku), 1, 1)),
                Instant.now().plusSeconds(600)));

        assertThatThrownBy(() -> jdbc.update("UPDATE inventory.stock_ledger SET quantity = 0 WHERE sku_id = ?", sku))
                .hasMessageContaining("只追加");
    }

    // —— 读侧口径 ——

    /**
     * 两个口径分开：交易口径只看默认仓，商家口径跨仓求和。
     *
     * <p>合并成一个方法，就会出现「页面显示有 5，下单说不够」——那是两个问题被当成了一个。
     */
    @Test
    void 交易口径与商家口径是两个数() {
        UUID sku = seedStock(10, 0);
        UUID merchant = merchantOf(sku);
        UUID secondWarehouse = Ids.newId();
        jdbc.update(
                "INSERT INTO inventory.stock (sku_id, warehouse_id, merchant_id, on_hand, available_to_promise, reserved, safety)"
                        + " VALUES (?, ?, ?, 7, 7, 0, 0)",
                sku,
                secondWarehouse,
                merchant);

        assertThat(queries.availableToPromiseByIds(List.of(sku))).containsEntry(sku, 10);
        assertThat(queries.availableToPromise(sku)).isEqualTo(10);
        assertThat(queries.availableAcrossWarehouses(List.of(sku))).containsEntry(sku, 17);
    }

    // —— 种子与点查 ——

    /** 建一行库存：实物 = 可售 = onHand，预占与安全库存为 0。 */
    private UUID seedStock(int onHand, int safety) {
        UUID sku = Ids.newId();
        UUID merchant = Ids.newId();
        jdbc.update(
                "INSERT INTO inventory.stock (sku_id, warehouse_id, merchant_id, on_hand, available_to_promise, reserved, safety)"
                        + " VALUES (?, ?, ?, ?, ?, 0, ?)",
                sku,
                WAREHOUSE,
                merchant,
                onHand,
                onHand - safety,
                safety);
        return sku;
    }

    private UUID merchantOf(UUID sku) {
        return jdbc.queryForObject(
                "SELECT merchant_id FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                UUID.class,
                sku,
                WAREHOUSE);
    }

    private int availableToPromise(UUID sku) {
        return jdbc.queryForObject(
                "SELECT available_to_promise FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                Integer.class,
                sku,
                WAREHOUSE);
    }

    private int onHand(UUID sku) {
        return jdbc.queryForObject(
                "SELECT on_hand FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                Integer.class,
                sku,
                WAREHOUSE);
    }

    private int reserved(UUID sku) {
        return jdbc.queryForObject(
                "SELECT reserved FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                Integer.class,
                sku,
                WAREHOUSE);
    }

    private int safety(UUID sku) {
        return jdbc.queryForObject(
                "SELECT safety FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                Integer.class,
                sku,
                WAREHOUSE);
    }

    private String reservationStatus(UUID sellerOrderId, int lineNo) {
        return jdbc.queryForObject(
                "SELECT status FROM inventory.reservation WHERE seller_order_id = ? AND line_no = ?",
                String.class,
                sellerOrderId,
                lineNo);
    }

    private int shippedQuantity(UUID sellerOrderId, int lineNo) {
        return jdbc.queryForObject(
                "SELECT shipped_quantity FROM inventory.reservation WHERE seller_order_id = ? AND line_no = ?",
                Integer.class,
                sellerOrderId,
                lineNo);
    }

    private int count(String type, UUID sku) {
        return jdbc.queryForObject(
                "SELECT count(*) FROM inventory.stock_ledger WHERE type = ? AND sku_id = ?", Integer.class, type, sku);
    }
}
