package com.shop.platform.cms;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.cms.dto.RecommendTabRequest;
import com.shop.platform.cms.service.ContentService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DuplicateKeyException;

/**
 * 推荐词条默认唯一性集成验证（真库）：「全局至多一个默认」由部分唯一索引
 * uk_recommend_tabs_default（WHERE is_default = TRUE，V60）钉死，service 写路径撞键经
 * DuplicateKeys 转 409。顺带钉住 update 的 NOT_NULL 跳过语义：isDefault/sortOrder 传 null
 * 保持库中原值，不被归零或强制取消默认。
 */
@SpringBootTest
class RecommendTabDefaultIT extends IntegrationTestSupport {

    @Autowired
    private ContentService contentService;

    /** 接管默认位：清掉全表 is_default（含 V13 种子行），用例结束按原集合恢复 */
    private void isolateDefaults() {
        var existing = jdbc.queryForList("SELECT id FROM cms.recommend_tabs WHERE is_default = TRUE", UUID.class);
        jdbc.update("UPDATE cms.recommend_tabs SET is_default = FALSE WHERE is_default = TRUE");
        for (UUID id : existing) {
            db.onDelete("UPDATE cms.recommend_tabs SET is_default = TRUE WHERE id = ?::uuid", id.toString());
        }
    }

    /** 直插一条词条（绕开 DTO 校验，聚焦 DB 不变式），登记清理后返回 id */
    private UUID seedTab(String name, boolean isDefault, int sortOrder) {
        UUID id = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO cms.recommend_tabs (id, name, is_default, sort_order) VALUES (?::uuid, ?, ?, ?)",
                id.toString(),
                name,
                isDefault,
                sortOrder);
        db.onDelete("DELETE FROM cms.recommend_tabs WHERE id = ?::uuid", id.toString());
        return id;
    }

    private boolean isDefaultInDb(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT is_default FROM cms.recommend_tabs WHERE id = ?::uuid", Boolean.class, id.toString()));
    }

    private int sortOrderInDb(UUID id) {
        return jdbc.queryForObject(
                "SELECT sort_order FROM cms.recommend_tabs WHERE id = ?::uuid", Integer.class, id.toString());
    }

    @Test
    void 部分唯一索引_直插第二条默认被拒() {
        isolateDefaults();
        seedTab("猜你喜欢", true, 1);

        assertThatThrownBy(() -> jdbc.update(
                        "INSERT INTO cms.recommend_tabs (name, is_default, sort_order) VALUES ('手机数码', true, 2)"))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("uk_recommend_tabs_default");
    }

    @Test
    void 创建词条_已有默认时再设默认_409且原默认不动() {
        isolateDefaults();
        UUID first = seedTab("猜你喜欢", true, 1);

        assertThatThrownBy(() -> contentService.createTab(new RecommendTabRequest("智能家居", null, "SEARCH", true, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(409));
        assertThat(isDefaultInDb(first)).isTrue();

        // 不带默认标记的创建不受索引影响；service 建出的行登记清理
        var created = contentService.createTab(new RecommendTabRequest("智能家居", null, "SEARCH", false, null));
        db.onDelete(
                "DELETE FROM cms.recommend_tabs WHERE id = ?::uuid",
                created.getId().toString());
        assertThat(isDefaultInDb(created.getId())).isFalse();
    }

    @Test
    void 更新词条_已有默认时把它设为默认_409() {
        isolateDefaults();
        UUID first = seedTab("猜你喜欢", true, 1);
        UUID second = seedTab("手机数码", false, 2);

        assertThatThrownBy(() ->
                        contentService.updateTab(second, new RecommendTabRequest("手机数码", null, "SEARCH", true, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(409));

        assertThat(isDefaultInDb(second)).isFalse();
        assertThat(isDefaultInDb(first)).isTrue();
    }

    @Test
    void 更新词条_排序与默认标记不传_保持库中原值() {
        isolateDefaults();
        UUID tab = seedTab("家电焕新", true, 7);

        contentService.updateTab(tab, new RecommendTabRequest("家电好物", null, "SEARCH", null, null));

        assertThat(isDefaultInDb(tab)).isTrue(); // isDefault 传 null 不强制取消默认
        assertThat(sortOrderInDb(tab)).isEqualTo(7); // sortOrder 传 null 不归零
    }
}
