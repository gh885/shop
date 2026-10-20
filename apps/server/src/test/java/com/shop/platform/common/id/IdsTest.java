package com.shop.platform.common.id;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class IdsTest {

    @Test
    void idsAreVersionSevenAndUnique() {
        Set<UUID> seen = new HashSet<>();
        for (int i = 0; i < 100_000; i++) {
            UUID id = Ids.newId();
            assertThat(id.version()).isEqualTo(7);
            assertThat(seen.add(id)).isTrue();
        }
    }

    @Test
    void idsSortInCreationOrderAtMillisecondGranularity() throws InterruptedException {
        UUID earlier = Ids.newId();
        Thread.sleep(5);
        UUID later = Ids.newId();

        assertThat(earlier).isLessThan(later);
    }
}
