package com.shop.platform.clearing.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.clearing.mapper.SettlementMapper;
import com.shop.platform.common.id.Ids;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * 结算的两个承诺：认领过的明细必须落进批次（金额与明细同源），净额非正不出负数打款单。
 *
 * <p>多实例互斥靠 dueItems 的 FOR UPDATE SKIP LOCKED，那是并发行为，单元里测不了真并发；
 * 这里验证的是单实例语义：结算后明细不再是 due，第二次进来拿空列表走人。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class SettlementServiceTest {

    @Autowired
    private SettlementService settlement;

    @Autowired
    private SettlementMapper store;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void settleMerchantSettlesClaimedItemsIntoOneBatch() {
        UUID merchantId = Ids.newId();
        UUID orderA = Ids.newId();
        UUID orderB = Ids.newId();
        insertReleased(orderA, merchantId, 100_00L, 8_00L);
        insertReleased(orderB, merchantId, 200_00L, 16_00L);

        boolean settled = settlement.settleMerchant(merchantId, "CNY", Instant.now());

        assertThat(settled).isTrue();
        assertThat(store.findItem(orderA).orElseThrow().status()).isEqualTo("settled");
        assertThat(store.findItem(orderB).orElseThrow().status()).isEqualTo("settled");
        UUID batchA = jdbc.queryForObject(
                "SELECT batch_id FROM clearing.settlement_item WHERE seller_order_id = ?", UUID.class, orderA);
        UUID batchB = jdbc.queryForObject(
                "SELECT batch_id FROM clearing.settlement_item WHERE seller_order_id = ?", UUID.class, orderB);
        assertThat(batchA).isEqualTo(batchB).isNotNull();
    }

    @Test
    void settleMerchantReturnsFalseWhenNothingDue() {
        UUID merchantId = Ids.newId();

        assertThat(settlement.settleMerchant(merchantId, "CNY", Instant.now())).isFalse();
    }

    @Test
    void nonPositiveNetLeavesItemsForNextBatch() {
        UUID merchantId = Ids.newId();
        UUID order = Ids.newId();
        insertReleased(order, merchantId, 100_00L, 8_00L);
        // 退款冲销吃满应付：商家承担的部分顶到净额上限，净额归零，不出打款单
        store.addRefunded(order, 10_000L);

        boolean settled = settlement.settleMerchant(merchantId, "CNY", Instant.now());

        assertThat(settled).isFalse();
        assertThat(store.findItem(order).orElseThrow().status()).isEqualTo("released");
    }

    private void insertReleased(UUID sellerOrderId, UUID merchantId, long payable, long commission) {
        store.insertItem(sellerOrderId, merchantId, "CNY", payable, payable, commission, payable - commission);
        assertThat(store.release(sellerOrderId)).isTrue();
        jdbc.update(
                "UPDATE clearing.settlement_item SET released_at = now() - interval '8 days'"
                        + " WHERE seller_order_id = ?",
                sellerOrderId);
    }
}
