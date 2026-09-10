package com.shop.platform.account;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 默认地址唯一性集成验证（真库）：「每用户至多一个默认」由 clearDefault 条件更新 +
 * 部分唯一索引 uk_addresses_default（WHERE is_default AND deleted_at IS NULL）共同兜底。
 * 顺带钉死归属闸门：动他人地址与不存在同罪（404 同话术）。
 */
@SpringBootTest
class AddressDefaultIT extends IntegrationTestSupport {

    @Autowired
    private com.shop.platform.account.service.AddressService addressService;

    private final UUID userId = UUID.randomUUID();

    /** 直插一条地址，返回 id（绕开 create 的 DTO 校验，聚焦默认态不变式） */
    private UUID seedAddress(boolean isDefault) {
        UUID id = UUID.randomUUID();
        jdbc.update(
                """
                INSERT INTO account.addresses
                  (id, user_id, receiver_name, phone, region_code, province, city, district, detail, is_default)
                VALUES (?::uuid, ?::uuid, '张三', '13800000000', '110100', '北京市', '北京市', '朝阳区', '测试路 1 号', ?)
                """,
                id.toString(),
                userId.toString(),
                isDefault);
        db.onDelete("DELETE FROM account.addresses WHERE id = ?::uuid", id.toString());
        return id;
    }

    private boolean isDefault(UUID id) {
        Boolean flag = jdbc.queryForObject(
                "SELECT is_default FROM account.addresses WHERE id = ?::uuid", Boolean.class, id.toString());
        assertNotNull(flag);
        return flag;
    }

    @Test
    void 设新默认_旧默认自动让位_全局仅一个() {
        UUID first = seedAddress(true); // 已是默认
        UUID second = seedAddress(false);

        addressService.setDefault(userId, second);

        assertFalse(isDefault(first)); // 被自动清掉
        assertTrue(isDefault(second));
    }

    @Test
    void 取消默认_允许无默认状态() {
        UUID only = seedAddress(true);

        addressService.unsetDefault(userId, only);

        assertFalse(isDefault(only));
        // 无默认状态下再设默认，不受唯一索引残留影响
        addressService.setDefault(userId, only);
        assertTrue(isDefault(only));
    }

    @Test
    void 动他人地址_404同话术不泄露存在性() {
        UUID foreign = UUID.randomUUID(); // 别人的地址行，本用户试图设默认
        jdbc.update(
                """
                INSERT INTO account.addresses
                  (id, user_id, receiver_name, phone, region_code, province, city, district, detail)
                VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?)
                """,
                foreign.toString(),
                UUID.randomUUID().toString(),
                "李四",
                "13900000000",
                "310100",
                "浙江省",
                "杭州市",
                "西湖区",
                "别家路 2 号");
        db.onDelete("DELETE FROM account.addresses WHERE id = ?::uuid", foreign.toString());

        BusinessException hidden =
                assertThrows(BusinessException.class, () -> addressService.setDefault(userId, foreign));
        assertEquals(404, hidden.getHttpStatus());
        assertEquals("地址不存在", hidden.getDetail());
    }
}
