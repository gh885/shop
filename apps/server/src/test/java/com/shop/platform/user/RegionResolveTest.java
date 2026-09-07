package com.shop.platform.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.alotuser.address.SmartAgent;
import com.alotuser.address.assets.UserInfo;
import com.shop.platform.infra.region.RegionRegistry;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

/** RegionRegistry 名称→区划码映射 + 智能粘贴解析 联调 */
class RegionResolveTest {

    private final RegionRegistry registry = new RegionRegistry(new ObjectMapper());

    /** 手动触发 @PostConstruct（避免 Spring 上下文） */
    private void init() {
        registry.load();
    }

    @Test
    void 常规省市区_命中区划码() {
        init();
        // 浙江省杭州市西湖区 → 西湖区国标码
        String code = registry.resolveCode("浙江省", "杭州市", "西湖区");
        assertThat(code).isNotBlank();
        assertThat(registry.isValidCode(code)).isTrue();
    }

    @Test
    void 直辖市_命中区划码() {
        init();
        // 直辖市：city 与省同名（北京市）
        String code = registry.resolveCode("北京市", "北京市", "朝阳区");
        assertThat(code).isNotBlank();
        assertThat(registry.isValidCode(code)).isTrue();
    }

    @Test
    void 未收录区划_返回null() {
        init();
        assertThat(registry.resolveCode("不存在省", "不存在市", "不存在区")).isNull();
    }

    @Test
    void 粘贴地址_端到端解析() {
        init();
        UserInfo info = SmartAgent.parseUserAddressString("张三 15987654321 广东省深圳市南山区科技园南路88号")
                .getUserInfo();
        String code = registry.resolveCode(info.getProvince(), info.getCity(), info.getCounty());
        assertThat(code).isNotBlank();
        assertThat(registry.isValidCode(code)).isTrue();
    }
}
