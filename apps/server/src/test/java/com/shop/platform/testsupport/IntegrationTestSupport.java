package com.shop.platform.testsupport;

import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
import com.shop.platform.order.api.OrderReadQuery;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 直连专用测试库（WSL2 PostgreSQL 的 shop_test，与 dev 库隔离）的集成测试基类：每个测试方法发一个 {@link TestDb}，
 * 结束自动 {@code purge()}。子类只负责 {@code @SpringBootTest} 注解与业务断言，
 * 清理一律经 {@code db.onDelete(...)} 登记，禁止再手写 {@code @AfterEach} 删数。
 */
@ActiveProfiles("test")
public abstract class IntegrationTestSupport {

    @Autowired
    protected JdbcTemplate jdbc;

    /** 发货链路跨模块：多个 IT 要造「已发货」场景，夹具收在基类一处 */
    @Autowired
    private ShipmentService shipmentService;

    @Autowired
    private OrderReadQuery orderReadQuery;

    protected TestDb db;

    @BeforeEach
    void initTestDb() {
        db = new TestDb(jdbc);
    }

    @AfterEach
    void purgeTestData() {
        if (db != null) {
            db.purge();
        }
    }

    /**
     * 把整单装进一个包裹并发出去（录单 → 交寄）：造「已发货」场景的公共夹具。
     *
     * <p>粒度是订单行 + 数量（docs/domain/order-model.md §4.4）：这里按整单的全量行发，
     * 要测部分发货 / 超发 / 取消回退的用例自己拼 lines。
     */
    protected void shipWholeOrder(UUID shopId, UUID orderId, String carrierCode, String trackingNo) {
        List<DispatchShipmentCommand.Line> lines = orderReadQuery.shipmentLinesById(orderId).stream()
                .map(line -> new DispatchShipmentCommand.Line(line.orderItemId(), line.quantity()))
                .toList();
        UUID shipmentId =
                shipmentService.record(new DispatchShipmentCommand(shopId, orderId, carrierCode, trackingNo, lines));
        shipmentService.dispatch(shopId, shipmentId);
    }
}
