package com.shop.platform.governance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.governance.api.GovernanceCommand;
import com.shop.platform.governance.api.ViolationKind;
import com.shop.platform.governance.controller.AdminGovernanceClueController;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.ForbiddenException;
import com.shop.platform.testsupport.IntegrationTest;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 违规线索的管理端：权限点 + 平台员工身份双向校验；report 的幂等键。
 */
class GovernanceClueAdminTest extends IntegrationTest {

    @Autowired
    private AdminGovernanceClueController controller;

    @Autowired
    private GovernanceCommand governance;

    @Test
    void 清单要平台员工加权限点() {
        UUID merchantId = Ids.newId();
        governance.report(new GovernanceCommand.ViolationClue(
                ViolationKind.SHIP_OVERDUE, merchantId, null, Instant.now(), "测试线索"));

        // 没有身份上下文：拒
        assertThatThrownBy(() -> controller.listClues(null, 100)).isInstanceOf(ForbiddenException.class);

        // 卖家即使被错授了权限点，也不是平台员工：拒
        Authorizer.runAs(operator("seller", "governance_clue:read"), () -> assertThatThrownBy(
                        () -> controller.listClues(null, 100))
                .isInstanceOf(com.shop.platform.infra.security.ForbiddenException.class));

        // 平台员工缺权限点：拒
        Authorizer.runAs(
                operator("staff", "reconciliation_statement:read"),
                () -> assertThatThrownBy(() -> controller.listClues(null, 100)).isInstanceOf(ForbiddenException.class));

        // 平台员工带权限点：能看见刚报的线索
        Authorizer.runAs(operator("staff", "governance_clue:read"), () -> assertThat(controller.listClues(null, 100))
                .anyMatch(row -> row.merchantId().equals(merchantId)));

        // 拼错的状态当场说清，不静默查成空清单
        assertThatThrownBy(() -> Authorizer.runAs(
                        operator("staff", "governance_clue:read"), () -> controller.listClues("nope", 100)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(400));
    }

    @Test
    void 同一单同一种线索只落一行() {
        UUID sellerOrderId = Ids.newId();
        for (int i = 0; i < 3; i++) {
            governance.report(new GovernanceCommand.ViolationClue(
                    ViolationKind.SHIP_OVERDUE, Ids.newId(), sellerOrderId, Instant.now(), "重复上报"));
        }
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM governance.violation_clue WHERE seller_order_id = ?",
                Integer.class,
                sellerOrderId);
        assertThat(count).isEqualTo(1);
    }

    private static CurrentOperator operator(String type, String... permissions) {
        return new CurrentOperator(UUID.randomUUID(), type, null, Set.of(), Set.copyOf(List.of(permissions)));
    }
}
