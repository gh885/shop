package com.shop.platform.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.ForbiddenException;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 传图凭证的判权池归属。这扇门在 {@code /api/seller} 下、服务的是卖家——判权却按平台员工打，
 * 卖家传图全量 403。钉住：merchant 池的码必须走 {@code seller()} 工厂，哪怕端点不认店铺上下文。
 */
class MediaControllerTest extends IntegrationTest {

    @Autowired
    private MediaController controller;

    @Test
    void sellerWithProductWriteReachesTheTicketGate() {
        CurrentOperator seller = new CurrentOperator(
                Ids.newId(),
                CurrentOperator.TYPE_SELLER,
                UUID.randomUUID(),
                Set.of(),
                Set.of(Permission.PRODUCT_WRITE.code()));
        Authorizer.runAs(seller, () -> {
            QiniuClient.ImageTicket ticket = controller.issueImageTicket("png");
            assertThat(ticket.key()).endsWith(".png");
            assertThat(ticket.token()).isNotBlank();
        });
    }

    @Test
    void staffTokenIsRejectedAtThePoolGate() {
        CurrentOperator staff = new CurrentOperator(
                Ids.newId(), CurrentOperator.TYPE_STAFF, null, Set.of(), Set.of(Permission.PRODUCT_WRITE.code()));
        Authorizer.runAs(staff, () -> assertThatThrownBy(() -> controller.issueImageTicket("png"))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("只有卖家"));
    }
}
