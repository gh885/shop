package com.shop.platform.infra.db;

import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.shop.platform.common.ShopIdHolder;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.StringValue;
import org.springframework.stereotype.Component;

/**
 * 商家数据行级隔离的 MyBatis 侧实现：给带 {@code shop_id} 的表自动追加 {@code shop_id = ?} 条件。
 *
 * <p>这条规则此前只写在文档与 code review 里——「每个查询都要带商家条件」。漏写不报错、测试也照绿，
 * 是越权面里唯一没有强制力的一环。本处理器把它变成 SQL 改写，写漏这件事在结构上不再发生。
 *
 * <p><b>只在卖家请求里生效</b>：{@link ShopIdHolder} 由 {@code ShopMembershipFilter} 仅对
 * {@code /seller/**} 装载，买家侧、平台侧、定时任务与 Flyway 迁移拿到的都是 null——此时整条链路
 * 不加条件（这些入口本就不该按店过滤）。这个「空上下文放行」的取舍与 V91 的 RLS 策略同口径。
 *
 * <p><b>只处理真的带 {@code shop_id} 列的表</b>（{@link #TENANT_TABLES}）。全局表（类目、承运商、
 * 员工、用户、平台审核）不在此列：给它们加条件是凭空造一个不存在的列，SQL 直接报错。
 *
 * <p>与 V91 的 RLS 是两层而不是二选一：本处理器只管 MyBatis 这条路径，{@code JdbcTemplate}
 * （各模块 api 包）与 PG 特有语法（{@code RETURNING OLD/NEW}、{@code ON CONFLICT}）是否被
 * 正确改写取决于 JSqlParser，而 RLS 在数据库层覆盖所有走这条连接的语句。
 */
@Component
public class ShopTenantHandler implements TenantLineHandler {

    /** 含 {@code shop_id} 列、需要按店过滤的表（与 V91 的 tenant_tables 同一份清单，改一处要同时改另一处） */
    public static final Set<String> TENANT_TABLES = Set.of(
            "account.shop_subaccounts",
            "aftersale.refunds",
            "coupon.coupon_templates",
            "coupon.coupon_usages",
            "coupon.user_coupons",
            "logistics.shipments",
            "orders.orders",
            "product.products",
            "product.skus",
            "review.reviews",
            "shop.addresses",
            "shop.shipping_templates",
            "shop.shop_members",
            "shop.shop_reviews");

    @Override
    public Expression getTenantId() {
        UUID shopId = ShopIdHolder.get();
        // ignoreTable 已经挡掉了空上下文，走到这里必然有值；仍做一次防御，避免拼出 "null" 字面量
        if (shopId == null) {
            throw new IllegalStateException("无店铺上下文时不应进入租户条件改写");
        }
        // 用 StringValue 而不是 LongValue：shop_id 是 uuid 列，PG 会把 'xxx'::text 隐式转成 uuid
        return new StringValue(shopId.toString());
    }

    @Override
    public String getTenantIdColumn() {
        return "shop_id";
    }

    @Override
    public boolean ignoreTable(String tableName) {
        // 没有店铺上下文 = 不是卖家请求，整条链路不加条件
        if (ShopIdHolder.get() == null) {
            return true;
        }
        return !TENANT_TABLES.contains(normalize(tableName));
    }

    /** 表名归一：去引号、转小写（解析器可能带回 {@code "product"."products"} 或大写形式） */
    private static String normalize(String tableName) {
        return tableName.replace("\"", "").trim().toLowerCase(Locale.ROOT);
    }
}
