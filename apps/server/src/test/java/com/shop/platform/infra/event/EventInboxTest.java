package com.shop.platform.infra.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.id.Ids;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class EventInboxTest extends IntegrationTest {

    @Autowired
    private EventInbox inbox;

    @Autowired
    private PlatformTransactionManager transactionManager;

    /** 每个测试用自己的 consumer 名，互不干扰，也不用清表。 */
    private static String newConsumer() {
        return "test-" + UUID.randomUUID();
    }

    @Test
    void firstClaimWinsAndSecondIsRejected() {
        String consumer = newConsumer();
        UUID eventId = Ids.newId();

        assertThat(inbox.claim(consumer, eventId)).isTrue();
        assertThat(inbox.claim(consumer, eventId)).isFalse();
    }

    @Test
    void differentConsumersEachGetTheirOwnClaim() {
        UUID eventId = Ids.newId();

        assertThat(inbox.claim(newConsumer(), eventId)).isTrue();
        assertThat(inbox.claim(newConsumer(), eventId)).isTrue();
    }

    @Test
    void claimIsRolledBackWithTheBusinessTransaction() {
        String consumer = newConsumer();
        UUID eventId = Ids.newId();
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
                    assertThat(inbox.claim(consumer, eventId)).isTrue();
                    throw new IllegalStateException("业务写失败");
                }))
                .isInstanceOf(IllegalStateException.class);

        // 业务回滚了，去重记录也跟着没了，下一次还能正常认领
        assertThat(inbox.claim(consumer, eventId)).isTrue();
    }
}
