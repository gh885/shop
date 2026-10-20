package com.shop.platform.infra.db;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 商家数据隔离的两层防护：MyBatis 租户插件（{@link ShopTenantHandler}）与数据库 RLS（V91）。
 *
 * <p>这里断言的是「隔离真的发生」，不是「配置存在」——前者会在插件顺序写错、表名清单漏项、
 * policy 条件写反时红，后者只会在有人删掉那行注解时红。
 *
 * <p><b>RLS 这半边在本机连不上效果</b>：测试库的连接用户是超级用户，而超级用户绕过 RLS（连
 * {@code FORCE ROW LEVEL SECURITY} 也绕）。所以这里只用「会话变量确实被写入」来证明接线正确，
 * 过滤效果由迁移脚本本身保证；换成非超级用户后这些断言仍成立。
 */
@SpringBootTest
class TenantIsolationIT extends IntegrationTestSupport {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ShopTenantHandler shopTenantHandler;

    @AfterEach
    void clearContext() {
        ShopIdHolder.clear();
    }

    @Test
    @DisplayName("无店铺上下文时租户插件不介入：平台/买家/定时任务路径不受影响")
    void 无上下文时不加条件() {
        assertThat(shopTenantHandler.ignoreTable("product.products")).isTrue();
    }

    @Test
    @DisplayName("有店铺上下文时只改写含 shop_id 的表，全局表原样放过")
    void 有上下文时按表清单判定() {
        ShopIdHolder.set(UUID.randomUUID());

        assertThat(shopTenantHandler.ignoreTable("product.products")).isFalse();
        assertThat(shopTenantHandler.ignoreTable("orders.orders")).isFalse();
        assertThat(shopTenantHandler.ignoreTable("product.skus")).isFalse();

        // 全局表：加条件是凭空造一个不存在的列，必须放过
        assertThat(shopTenantHandler.ignoreTable("product.categories")).isTrue();
        assertThat(shopTenantHandler.ignoreTable("account.users")).isTrue();
        assertThat(shopTenantHandler.ignoreTable("logistics.carriers")).isTrue();
        assertThat(shopTenantHandler.ignoreTable("account.staff")).isTrue();
    }

    @Test
    @DisplayName("表名带引号或大写时仍能命中清单（解析器回传形状不固定）")
    void 表名归一() {
        ShopIdHolder.set(UUID.randomUUID());

        assertThat(shopTenantHandler.ignoreTable("\"product\".\"products\"")).isFalse();
        assertThat(shopTenantHandler.ignoreTable("PRODUCT.PRODUCTS")).isFalse();
        assertThat(shopTenantHandler.ignoreTable(" product.products ")).isFalse();
    }

    @Test
    @DisplayName("RLS 会话变量：卖家上下文借出的连接上确实写进了 app.current_shop")
    void 连接上写入了租户变量() {
        UUID shopId = UUID.randomUUID();
        ShopIdHolder.set(shopId);

        String seen = jdbc.queryForObject("select current_setting('app.current_shop', true)", String.class);
        assertThat(seen).isEqualTo(shopId.toString());
    }

    @Test
    @DisplayName("RLS 会话变量：没有店铺上下文时不写变量（买家/平台/迁移路径）")
    void 无上下文不写变量() {
        ShopIdHolder.clear();

        String seen =
                jdbc.queryForObject("select coalesce(current_setting('app.current_shop', true), '')", String.class);
        assertThat(seen).isEmpty();
    }

    @Test
    @DisplayName("迁移建出的 policy 覆盖了全部含 shop_id 的表，且没有漏掉新表")
    void 策略覆盖与表清单一致() {
        List<String> policied = jdbc.queryForList(
                """
                select n.nspname || '.' || c.relname
                from pg_policy p
                join pg_class c on c.oid = p.polrelid
                join pg_namespace n on n.oid = c.relnamespace
                where p.polname = 'tenant_isolation'
                order by 1
                """,
                String.class);

        assertThat(policied)
                .as("V91 的 tenant_tables 与 ShopTenantHandler.TENANT_TABLES 必须同一份清单")
                .containsExactlyInAnyOrderElementsOf(ShopTenantHandler.TENANT_TABLES);
    }

    @Test
    @DisplayName("含 shop_id 列的表都在隔离清单里：新表带 shop_id 却忘了登记会在这里红")
    void 没有遗漏的表() {
        List<String> withShopId = jdbc.queryForList(
                """
                select table_schema || '.' || table_name
                from information_schema.columns
                where column_name = 'shop_id'
                  and table_schema not in ('pg_catalog', 'information_schema')
                order by 1
                """,
                String.class);

        assertThat(withShopId)
                .as("有 shop_id 列但不在租户隔离清单里的表：要么登记进 TENANT_TABLES + V91，要么说明它为什么不该隔离")
                .containsExactlyInAnyOrderElementsOf(ShopTenantHandler.TENANT_TABLES);
    }
}
