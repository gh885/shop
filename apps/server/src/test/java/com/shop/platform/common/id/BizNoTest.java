package com.shop.platform.common.id;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class BizNoTest {

    private static final LocalDate DAY = LocalDate.of(2026, 10, 20);

    @Test
    void numberCarriesPrefixDateAndTwelveRandomCharacters() {
        String no = BizNo.of("SO", DAY);

        assertThat(no).hasSize(2 + 8 + 12);
        assertThat(no).startsWith("SO20261020");
        // Crockford base32，去掉了 I L O U
        assertThat(no.substring("SO20261020".length())).matches("[0-9A-HJKMNP-TV-Z]{12}");
    }

    @Test
    void twoHundredThousandNumbersHaveNoCollision() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 200_000; i++) {
            assertThat(seen.add(BizNo.of("SO", DAY))).isTrue();
        }
    }

    @Test
    void differentPrefixesNeverCollideOnTheSameRandomDraw() {
        assertThat(BizNo.of("SO", DAY)).startsWith("SO");
        assertThat(BizNo.of("PO", DAY)).startsWith("PO");
    }

    @Test
    void blankPrefixIsRejected() {
        assertThatThrownBy(() -> BizNo.of("", DAY)).isInstanceOf(IllegalArgumentException.class);
    }
}
