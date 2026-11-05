package com.shop.platform.infra.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

/**
 * 管理端事件入口：清单与放行的权限与平台员工身份双向校验。
 */
class EventAdminControllerTest extends IntegrationTest {

    @Autowired
    private EventAdminController controller;

    @Test
    void 清单和放行都要平台员工身份加权限点() {
        // 没有身份上下文：拒
        assertThatThrownBy(controller::incomplete).isInstanceOf(ForbiddenException.class);

        // 平台员工缺权限点：拒
        Authorizer.runAs(operator("staff", "job:trigger"), () -> assertThatThrownBy(controller::incomplete)
                .isInstanceOf(ForbiddenException.class));

        // 权限点不豁免身份：非员工即使被错授了权限点也拒
        Authorizer.runAs(
                operator("buyer", "event_record:replay"),
                () -> assertThatThrownBy(() -> controller.requeue(Ids.newId())).isInstanceOf(ForbiddenException.class));

        // 平台员工带权限点：清单能看
        Authorizer.runAs(operator("staff", "event_record:replay"), () -> assertThat(controller.incomplete())
                .isNotNull());
    }

    // —— 种子与工具 ——

    private static CurrentOperator operator(String type, String... permissions) {
        return new CurrentOperator(UUID.randomUUID(), type, null, Set.of(), Set.copyOf(List.of(permissions)));
    }
}
