package com.shop.platform.account;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.account.mapper.BuyerMapper;
import com.shop.platform.common.id.Ids;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 直接打 {@link BuyerMapper}：验证 @Select 的 record 构造器按参数名自动映射、
 * {@code OffsetDateTime} 参数、以及布尔返回的 CAS 判决。
 *
 * <p>record 投影是全项目 @Select 的机制底座——它要是映射错了（列对不上参数名），
 * 服务层拿到的就是静默 null，必须有一条真的打进去的查询守着。
 */
@SpringBootTest
@ActiveProfiles("test")
class BuyerMapperTest {

    @Autowired
    private BuyerMapper buyers;

    @Test
    void 投影按构造器参数名自动映射() {
        UUID buyerId = Ids.newId();
        String phone = randomPhone();

        buyers.insert(buyerId, phone, null, "投影测试");

        BuyerMapper.BuyerRow row = buyers.find(buyerId).orElseThrow();
        assertThat(row.buyerId()).isEqualTo(buyerId);
        assertThat(row.phone()).isEqualTo(phone);
        assertThat(row.displayName()).isEqualTo("投影测试");
        assertThat(row.status()).isEqualTo("active");
        assertThat(row.deletionRequestedAt()).isNull();
        assertThat(row.deletedAt()).isNull();
        assertThat(row.active()).isTrue();

        BuyerMapper.PhoneRow phoneRow = buyers.findByPhone(phone).orElseThrow();
        assertThat(phoneRow.buyerId()).isEqualTo(buyerId);
        assertThat(phoneRow.passwordHash()).isNull();
        assertThat(phoneRow.lastLoginAt()).isNull();

        BuyerMapper.Credentials credentials = buyers.findActiveByPhone(phone).orElseThrow();
        assertThat(credentials.buyerId()).isEqualTo(buyerId);
        assertThat(credentials.passwordHash()).isNull();

        // 单列 null 的查询：Optional.empty，而不是包着一个 null
        assertThat(buyers.findPasswordHash(buyerId)).isEmpty();
    }

    @Test
    void 条件更新返回布尔判决() {
        UUID buyerId = Ids.newId();
        String phone = randomPhone();
        buyers.insert(buyerId, phone, null, "判决测试");

        buyers.touchLastLogin(buyerId, java.time.OffsetDateTime.now());
        assertThat(buyers.updatePasswordHash(buyerId, "hash")).isTrue();
        assertThat(buyers.markDeletionRequested(buyerId, java.time.OffsetDateTime.now()))
                .isTrue();
        // CAS：第二个请求落申请必须失败——0 行是判决
        assertThat(buyers.markDeletionRequested(buyerId, java.time.OffsetDateTime.now()))
                .isFalse();
        assertThat(buyers.cancelDeletion(buyerId)).isTrue();
        assertThat(buyers.cancelDeletion(buyerId)).isFalse();
    }

    /** 合法手机号形状（ck_buyer_phone）：13 开头 + 9 位数字。 */
    private static String randomPhone() {
        int digits = java.util.concurrent.ThreadLocalRandom.current().nextInt(1_000_000_000);
        return "13" + String.format("%09d", digits);
    }
}
