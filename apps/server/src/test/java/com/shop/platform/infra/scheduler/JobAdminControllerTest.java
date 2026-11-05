package com.shop.platform.infra.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
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
 * 管理端任务入口：触发要平台员工身份加权限点。
 */
class JobAdminControllerTest extends IntegrationTest {

    @Autowired
    private JobAdminController controller;

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

    private static CurrentOperator operator(String type, String... permissions) {
        return new CurrentOperator(UUID.randomUUID(), type, null, Set.of(), Set.copyOf(List.of(permissions)));
    }
}
