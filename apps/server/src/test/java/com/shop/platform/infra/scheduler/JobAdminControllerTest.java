package com.shop.platform.infra.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.ForbiddenException;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * 管理端任务入口：注册表覆盖全部任务、手动触发真的跑了一轮、权限与身份双向校验。
 * 触发与定时调度同一条 runNow，副作用断言借支付关单——它只依赖一行支付单，链路最短。
 */
class JobAdminControllerTest extends IntegrationTest {

    @Autowired
    private JobAdminController controller;

    @Autowired
    private JobRegistry jobs;

    @Test
    void 注册表覆盖全部任务_禁用的不在清单_未知任务404带可用清单() {
        assertThat(jobs.names())
                .contains(
                        "shop.job.trade.expiry",
                        "shop.job.fulfillment.auto-receive",
                        "shop.job.fulfillment.ship-deadline",
                        "shop.job.payment.expiry",
                        "shop.job.payment.refund-retry",
                        "shop.job.inventory.expiry",
                        "shop.job.returns.deadline",
                        "shop.job.clearing.settle",
                        "shop.job.clearing.reconcile",
                        "shop.job.pricing.cleanup",
                        "shop.job.event.cleanup");
        // 浘认 profile 关掉了事件补发，禁用的任务不该出现在可触发清单里
        assertThat(jobs.names()).doesNotContain("shop.job.event.retry");

        assertThatThrownBy(() -> jobs.require("shop.job.nope")).isInstanceOfSatisfying(BusinessException.class, e -> {
            assertThat(e.getHttpStatus()).isEqualTo(404);
            assertThat(e.getMessage()).contains("shop.job.trade.expiry");
        });
    }

    @Test
    void 手动触发真的跑了一轮() throws Exception {
        UUID paymentId = seedExpiredPendingPayment();
        jobs.triggerAsync(jobs.require("shop.job.payment.expiry"));

        awaitClosed(paymentId);
        // 同一任务再触发一次：CAS 前置条件不成立，结果不变（幂等不是靠触发端克制）
        jobs.triggerAsync(jobs.require("shop.job.payment.expiry"));
        Thread.sleep(200);
        assertThat(statusOf(paymentId)).isEqualTo("closed");
    }

    @Test
    void 触发要平台员工身份加权限点() {
        // 没有身份上下文：拒
        assertThatThrownBy(() -> controller.trigger("shop.job.trade.expiry")).isInstanceOf(ForbiddenException.class);

        // 买家即使被错授了权限点，也不是平台员工：拒（权限点不豁免身份）
        // 池的匹配现在由 Authorizer.platform() 做，所以是 ForbiddenException 而不是手写的 STAFF_ONLY
        Authorizer.runAs(operator("buyer", "job:trigger"), () -> assertThatThrownBy(
                        () -> controller.trigger("shop.job.trade.expiry"))
                .isInstanceOf(ForbiddenException.class));

        // 平台员工缺权限点：拒
        Authorizer.runAs(operator("staff", "reconciliation_statement:read"), () -> assertThatThrownBy(
                        () -> controller.trigger("shop.job.trade.expiry"))
                .isInstanceOf(ForbiddenException.class));

        // 平台员工带权限点：202，响应带任务名
        Authorizer.runAs(operator("staff", "job:trigger"), () -> {
            ResponseEntity<JobAdminController.Triggered> response = controller.trigger("shop.job.trade.expiry");
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
            assertThat(response.getBody().job()).isEqualTo("shop.job.trade.expiry");
        });

        // 带权限的员工也看不到不存在的任务
        Authorizer.runAs(
                operator("staff", "job:trigger"), () -> assertThatThrownBy(() -> controller.trigger("shop.job.nope"))
                        .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                                .isEqualTo(404)));

        // 清单接口同样要权限
        assertThatThrownBy(() -> controller.names()).isInstanceOf(ForbiddenException.class);
        Authorizer.runAs(operator("staff", "job:trigger"), () -> assertThat(controller.names())
                .contains("shop.job.trade.expiry"));
    }

    // —— 种子与工具 ——

    /** 一张已过期 10 分钟的 pending 支付单：支付关单任务的最短可造前置。 */
    private UUID seedExpiredPendingPayment() {
        UUID id = Ids.newId();
        jdbc.update(
                "INSERT INTO payment.payment_order"
                        + " (id, payment_no, buyer_id, order_group_id, channel, out_trade_no,"
                        + "  amount, expected_amount, currency, expires_at)"
                        + " VALUES (?, ?, ?, ?, 'mock', ?, 100, 100, 'CNY', now() - interval '10 minutes')",
                id,
                "PAY-TEST-" + id,
                Ids.newId(),
                Ids.newId(),
                "MOCK-" + id);
        return id;
    }

    private String statusOf(UUID paymentId) {
        return jdbc.queryForObject("SELECT status FROM payment.payment_order WHERE id = ?", String.class, paymentId);
    }

    private void awaitClosed(UUID paymentId) throws InterruptedException {
        for (int i = 0; i < 100; i++) {
            if ("closed".equals(statusOf(paymentId))) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("支付单没有被手动触发关掉: " + paymentId);
    }

    private static CurrentOperator operator(String type, String... permissions) {
        return new CurrentOperator(UUID.randomUUID(), type, null, Set.of(), Set.copyOf(List.of(permissions)));
    }
}
