package com.shop.platform.audit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.common.id.Ids;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class AuditRecorderTest extends IntegrationTest {

    @Autowired
    private AuditRecorder recorder;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private static String newObjectId() {
        return UUID.randomUUID().toString();
    }

    @Test
    void recordsWhoChangedWhatFromWhatToWhat() {
        String objectId = newObjectId();
        UUID staffId = Ids.newId();

        recorder.record(AuditEntry.byStaff(
                "payment.suspense.dismissed",
                "order",
                objectId,
                staffId,
                null,
                Map.of("unit_price", FieldChange.of(9900, 8900))));

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT action, operator_type, operator_id, result FROM audit.entry WHERE object_id = ?", objectId);
        assertThat(row.get("action")).isEqualTo("payment.suspense.dismissed");
        assertThat(row.get("operator_type")).isEqualTo("staff");
        assertThat(row.get("operator_id")).isEqualTo(staffId);
        assertThat(row.get("result")).isEqualTo("success");

        String changes = jdbc.queryForObject(
                "SELECT changes::text FROM audit.entry WHERE object_id = ?", String.class, objectId);
        assertThat(changes).contains("unit_price").contains("9900").contains("8900");
    }

    @Test
    void actionOutsideTheCatalogueIsRejected() {
        assertThatThrownBy(() -> recorder.record(AuditEntry.bySystem(
                        "trade.order.something_nobody_registered",
                        "order",
                        newObjectId(),
                        Map.of("x", FieldChange.of(1, 2)))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("未登记的审计动作");
    }

    @Test
    void recordedRowsCannotBeUpdated() {
        String objectId = newObjectId();
        recorder.record(AuditEntry.bySystem(
                "catalog.listing.offline", "listing", objectId, Map.of("status", FieldChange.of("online", "offline"))));

        assertThatThrownBy(() -> jdbc.update("UPDATE audit.entry SET result = 'failure' WHERE object_id = ?", objectId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("只追加");
    }

    @Test
    void recordedRowsCannotBeDeleted() {
        String objectId = newObjectId();
        recorder.record(AuditEntry.bySystem(
                "catalog.listing.offline", "listing", objectId, Map.of("status", FieldChange.of("online", "offline"))));

        assertThatThrownBy(() -> jdbc.update("DELETE FROM audit.entry WHERE object_id = ?", objectId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("只追加");
    }

    @Test
    void auditDisappearsWhenTheBusinessTransactionRollsBack() {
        String objectId = newObjectId();
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
                    recorder.record(AuditEntry.bySystem(
                            "catalog.product.stock_adjusted",
                            "sku",
                            objectId,
                            Map.of("quantity", FieldChange.of(10, 5))));
                    throw new IllegalStateException("业务写失败");
                }))
                .isInstanceOf(IllegalStateException.class);

        Integer count =
                jdbc.queryForObject("SELECT count(*) FROM audit.entry WHERE object_id = ?", Integer.class, objectId);
        assertThat(count).isZero();
    }
}
