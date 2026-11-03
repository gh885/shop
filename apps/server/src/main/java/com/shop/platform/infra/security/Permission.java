package com.shop.platform.infra.security;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 全局权限点。<b>本文件由 {@code scripts/contracts/permissions-codegen.mjs} 从
 * {@code contracts/permissions.yaml} 生成，不要手改。</b>
 *
 * <p>生成的而不是手写的：手写枚举 + 启动对拍是"两份清单 + 一道门"，门能挡住漂移但不消除它。
 * 生成之后结构上不可能漂——"这个码存在吗"只有一个答案。
 *
 * <p><b>码只有一种形态：{@code resource:action}，小写。</b>判权时它是不透明原子，不解析；
 * {@link #resource()} 是冗余视图，从码推导，不单独存。
 *
 * <p>构造参数与 yaml 的列一一对应（scope / pool / risk / 可转授）。后两维用
 * {@link Risk} / {@link Grant} 枚举常量而不是布尔：四十多个常量排下来，
 * {@code false, true} 无法复查、相邻两行交换也看不出来，具名常量可以。
 *
 * <p>{@link Pool} 是"这个码在哪个主体池里有意义"，是集合不是排他域：{@code order:read} 是
 * {@link Pool#BOTH}——商家读自己的单、平台读全平台的单，同一个码。标成排他域就得新增
 * {@code ORDER_READ_ADMIN}，同一件事两个码必然漂。它唯一的用途是推导主账号的权限集合。
 *
 * <p>{@link Scope} 是商家侧的范围求值方式。平台主体无视它——平台不在任何租户里，范围恒为全平台。
 */
public enum Permission {
    /** 读订单 */
    ORDER_READ("order:read", Scope.SHOP, Pool.BOTH, Risk.NORMAL, Grant.GRANTABLE),
    /** 处理售后（拒绝、留言、举证，不动钱） */
    AFTER_SALE_CASE_HANDLE("after_sale_case:handle", Scope.SHOP, Pool.MERCHANT, Risk.NORMAL, Grant.GRANTABLE),
    /** 同意退款（动钱，受角色退款上限约束）（高风险） */
    AFTER_SALE_CASE_REFUND("after_sale_case:refund", Scope.SHOP, Pool.MERCHANT, Risk.HIGH, Grant.GRANTABLE),
    /** 读包裹与轨迹 */
    PACKAGE_READ("package:read", Scope.SHOP, Pool.BOTH, Risk.NORMAL, Grant.GRANTABLE),
    /** 发货 */
    PACKAGE_SHIP("package:ship", Scope.SHOP, Pool.MERCHANT, Risk.NORMAL, Grant.GRANTABLE),
    /** 人工补录物流轨迹（高风险） */
    PACKAGE_TRACK("package:track", Scope.SHOP, Pool.PLATFORM, Risk.HIGH, Grant.OWNER_ONLY),
    /** 读商品 */
    PRODUCT_READ("product:read", Scope.SHOP, Pool.BOTH, Risk.NORMAL, Grant.GRANTABLE),
    /** 商品建、改、上下架 */
    PRODUCT_WRITE("product:write", Scope.SHOP, Pool.MERCHANT, Risk.NORMAL, Grant.GRANTABLE),
    /** 商品审核（通过 / 驳回） */
    PRODUCT_REVIEW("product:review", Scope.SHOP, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 读库存与库存流水 */
    INVENTORY_READ("inventory:read", Scope.SHOP, Pool.MERCHANT, Risk.NORMAL, Grant.GRANTABLE),
    /** 调整可售库存 */
    INVENTORY_ADJUST("inventory:adjust", Scope.SHOP, Pool.MERCHANT, Risk.NORMAL, Grant.GRANTABLE),
    /** 类目树的建、改、移动、归档 */
    CATEGORY_CONFIGURE("category:configure", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 品牌库的建、改、归档 */
    BRAND_CONFIGURE("brand:configure", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 改店铺资料（读自己店不判权，平台读店是 review 的一部分） */
    SHOP_UPDATE("shop:update", Scope.MERCHANT, Pool.MERCHANT, Risk.NORMAL, Grant.GRANTABLE),
    /** 关闭店铺（不可逆）（高风险） */
    SHOP_CLOSE("shop:close", Scope.MERCHANT, Pool.MERCHANT, Risk.HIGH, Grant.OWNER_ONLY),
    /** 入驻审核（通过 / 驳回） */
    SHOP_REVIEW("shop:review", Scope.MERCHANT, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 暂停 / 恢复经营（高风险） */
    SHOP_SUSPEND("shop:suspend", Scope.MERCHANT, Pool.PLATFORM, Risk.HIGH, Grant.OWNER_ONLY),
    /** 管理子账号、角色与授权（高风险） */
    MERCHANT_STAFF_WRITE("merchant_staff:write", Scope.MERCHANT, Pool.MERCHANT, Risk.HIGH, Grant.OWNER_ONLY),
    /** 读结算单与账单（放款由平台或系统触发） */
    SETTLEMENT_READ("settlement:read", Scope.SHOP, Pool.BOTH, Risk.NORMAL, Grant.GRANTABLE),
    /** 运费模板的建、改、启用、归档 */
    SHIPPING_TEMPLATE_CONFIGURE("shipping_template:configure", Scope.SHOP, Pool.MERCHANT, Risk.NORMAL, Grant.GRANTABLE),
    /** 建券、改券模板 */
    COUPON_CONFIGURE("coupon:configure", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 发放优惠券（立即产生负债）（高风险） */
    COUPON_ISSUE("coupon:issue", Scope.NONE, Pool.PLATFORM, Risk.HIGH, Grant.OWNER_ONLY),
    /** 建、改促销规则（草稿态） */
    PROMOTION_RULE_CONFIGURE("promotion_rule:configure", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 上线 / 下线规则（改所有买家看到的价格）（高风险） */
    PROMOTION_RULE_ACTIVATE("promotion_rule:activate", Scope.NONE, Pool.PLATFORM, Risk.HIGH, Grant.OWNER_ONLY),
    /** 读广告位与投放数据 */
    AD_READ("ad:read", Scope.SHOP, Pool.BOTH, Risk.NORMAL, Grant.GRANTABLE),
    /** 建、改广告投放 */
    AD_WRITE("ad:write", Scope.SHOP, Pool.MERCHANT, Risk.NORMAL, Grant.GRANTABLE),
    /** 广告审核 */
    AD_REVIEW("ad:review", Scope.SHOP, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 建、改、发布内容 */
    CONTENT_ARTICLE_WRITE("content_article:write", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 读违规线索 */
    GOVERNANCE_CLUE_READ("governance_clue:read", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 读买家资料 */
    BUYER_ACCOUNT_READ("buyer_account:read", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 封禁 / 解封买家（高风险） */
    BUYER_ACCOUNT_SUSPEND("buyer_account:suspend", Scope.NONE, Pool.PLATFORM, Risk.HIGH, Grant.OWNER_ONLY),
    /** 平台员工的建、调岗、禁用（高风险） */
    PLATFORM_STAFF_WRITE("platform_staff:write", Scope.NONE, Pool.PLATFORM, Risk.HIGH, Grant.OWNER_ONLY),
    /** 读挂账清单 */
    SUSPENSE_READ("suspense:read", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 挂账原路退款（动真钱）（高风险） */
    SUSPENSE_REFUND("suspense:refund", Scope.NONE, Pool.PLATFORM, Risk.HIGH, Grant.OWNER_ONLY),
    /** 驳回挂账 */
    SUSPENSE_REJECT("suspense:reject", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 读对账结果与资金结构 */
    RECONCILIATION_STATEMENT_READ("reconciliation_statement:read", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 手动触发定时任务 */
    JOB_TRIGGER("job:trigger", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 读未完成的事件登记 */
    EVENT_RECORD_READ("event_record:read", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 事件重放（让已被判死的事件重新生效）（高风险） */
    EVENT_RECORD_REPLAY("event_record:replay", Scope.NONE, Pool.PLATFORM, Risk.HIGH, Grant.OWNER_ONLY),
    /** 读审计日志 */
    AUDIT_LOG_READ("audit_log:read", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),
    /** 读 RUM 采集与告警面板 */
    RUM_REPORT_READ("rum_report:read", Scope.NONE, Pool.PLATFORM, Risk.NORMAL, Grant.OWNER_ONLY),;

    /** 这个码在哪个主体池里有意义。集合语义：BOTH = 两侧都能持有同一个码。 */
    public enum Pool {
        MERCHANT,
        PLATFORM,
        BOTH;

        public boolean coversMerchant() {
            return this == MERCHANT || this == BOTH;
        }

        public boolean coversPlatform() {
            return this == PLATFORM || this == BOTH;
        }
    }

    /** 商家侧的范围求值方式。都是符号值，不枚举具体行。 */
    public enum Scope {
        /** 无范围，平台级 */
        NONE,
        /** 本商家（由归属推导，不配置） */
        MERCHANT,
        /** 授权的店集合；ALL 时生成 SQL 不加 shop 谓词 */
        SHOP
    }

    /** 动作的爆炸半径：high = 一次操作能改变别人的钱 / 全平台可见状态 / 封停账号 / 管钥匙。 */
    public enum Risk {
        NORMAL,
        HIGH
    }

    /** 商家能不能把这个码授给子账号。与 {@link Risk} 不是一回事：动自己的钱的码 high 但可转授。 */
    public enum Grant {
        /** 只有主账号持有，不进任何商家角色 */
        OWNER_ONLY,
        /** 可进子账号可授予清单 */
        GRANTABLE
    }

    private final String code;
    private final Scope scope;
    private final Pool pool;
    private final Risk risk;
    private final Grant grant;

    Permission(String code, Scope scope, Pool pool, Risk risk, Grant grant) {
        this.code = code;
        this.scope = scope;
        this.pool = pool;
        this.risk = risk;
        this.grant = grant;
    }

    public String code() {
        return code;
    }

    /** 码的 resource 段，从码本身推导——码是 {@code resource:action}，再存一份只会漂。 */
    public String resource() {
        return code.substring(0, code.indexOf(':'));
    }

    public Scope scope() {
        return scope;
    }

    public Pool pool() {
        return pool;
    }

    /** 动钱、动全平台可见状态、封停账号、管钥匙。岗位到高危码的授予在 {@code staff_roles} 逐条显式写。 */
    public boolean highRisk() {
        return risk == Risk.HIGH;
    }

    /** 商家能不能把它授给子账号。与 {@link #highRisk()} 不是一回事。 */
    public boolean assignable() {
        return grant == Grant.GRANTABLE;
    }

    /** 全部码。库里出现的码必须 ⊆ 这个集合。 */
    public static Set<String> codes() {
        return Arrays.stream(values()).map(Permission::code).collect(Collectors.toUnmodifiableSet());
    }

    /** 商家子账号可持有的码（角色里出现集合外的码 → 越权）。 */
    public static Set<String> assignableCodes() {
        return Arrays.stream(values())
                .filter(Permission::assignable)
                .map(Permission::code)
                .collect(Collectors.toUnmodifiableSet());
    }

    /** 商家主体能持有的全部码 = 主账号的权限集合。 */
    public static Set<String> merchantPoolCodes() {
        return Arrays.stream(values())
                .filter(permission -> permission.pool.coversMerchant())
                .map(Permission::code)
                .collect(Collectors.toUnmodifiableSet());
    }

    /**
     * 平台岗位 → 权限码。**从代码推导，不查库**——种子行漏同步是静默失权，删表是全体失权。
     * {@code SUPER_ADMIN} 不在这张表里：它的集合恒等于 {@link #codes()}。
     */
    private static final Map<String, Set<String>> STAFF_ROLES = Map.ofEntries(
            Map.entry("REVIEWER", Set.of("shop:review", "shop:suspend", "audit_log:read")),
            Map.entry("OPS", Set.of("category:configure", "content_article:write", "package:track", "coupon:configure", "audit_log:read", "rum_report:read", "shop:suspend")));

    public static Set<String> staffRoleCodes(String role) {
        if ("SUPER_ADMIN".equals(role)) {
            return codes();
        }
        return STAFF_ROLES.getOrDefault(role, Set.of());
    }
}
