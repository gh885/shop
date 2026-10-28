package com.shop.platform.infra.security;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 全局权限点。清单驱动——这份枚举和 {@code common.permission} 表在启动时做双向比对，
 * 少一个多一个应用都起不来。
 *
 * <p>新增一条时改四处：这里加枚举常量（**带上域**）、写一条迁移往 {@code common.permission} 插行
 * （{@code owner} 与 {@code domain} 都是 NOT NULL）、在 {@code contracts/permissions.yaml} 登记、
 * 跑 {@code pnpm permissions:gen} 重生成前端常量——四方对拍由 {@code PermissionVocabularyTest}
 * 一条测试全核，少一处就红灯。
 *
 * <p>为什么不用字符串常量散落在各处：拼错一个字母不会报错，只会让那项权限永远为假，
 * 或者永远为真。这类 bug 只有在出事时才会被发现。
 *
 * <p><b>域是硬边界，不是注释。</b> 三套身份（买家 / 卖家 / 平台员工）共用一份清单，
 * 但「这个码能授给谁」必须只有一个答案。这条不是理论洁癖——卖家主账号的解析曾经授的是
 * 整张 {@code common.permission} 表，于是一个店主拿到了 {@link #SUSPENSE_MANAGE}（手动退真钱）
 * 和 {@link #LEDGER_VIEW}（全平台余额）。没有域这一维，那种错授没有任何东西能挡住。
 * 现在 {@link Authorizer} 启动时校验两个 {@code role_permission} 表里没有跨域授予，违反即起不来。
 *
 * <p><b>权限码只有一种形态：大写下划线。</b> 卖家域原来那 9 个写成了 {@code order:read} 这种
 * {@code 域:动作} 小写形态，同一个枚举里两种风格意味着「这个名字是干什么的」没有统一答案，
 * 前端与文档两处写法迟早对不上。V20261026100000 一次性改成大写。
 */
public enum Permission {
    // —— 卖家域（店铺账号，店主可授予子账号）——
    ORDER_READ("ORDER_READ", Domain.SELLER),
    /**
     * 处理本店售后（拒绝、留言、举证），<b>不动钱</b>，可授予子账号。
     *
     * <p>动钱的「同意退款」是 {@link #ORDER_REFUND_APPROVE}，两个码不许合并——
     * 合并的结局只有两个：客服能动钱，或客服处理不了售后。
     */
    ORDER_REFUND("ORDER_REFUND", Domain.SELLER),
    /**
     * 同意退款 / 确认退款——动钱出口，<b>主账号专属，不进子账号可授予清单</b>。
     *
     * <p>与 {@link #ORDER_REFUND} 拆开的依据是动作的爆炸半径而不是岗位名称：
     * 拒绝和举证不改变任何人的余额，「同意」改变。
     */
    ORDER_REFUND_APPROVE("ORDER_REFUND_APPROVE", Domain.SELLER),
    PRODUCT_READ("PRODUCT_READ", Domain.SELLER),
    PRODUCT_WRITE("PRODUCT_WRITE", Domain.SELLER),
    SHOP_READ("SHOP_READ", Domain.SELLER),
    /**
     * 管理本店子账号与角色。
     *
     * <p>与平台侧 {@link #STAFF_MANAGE} 分开：一个是店主管自己的客服，一个是平台管员工。
     * 同一个字符串两种含义正是要防的，所以码本身也不同名。
     */
    SELLER_STAFF_MANAGE("SELLER_STAFF_MANAGE", Domain.SELLER),
    FINANCE_READ("FINANCE_READ", Domain.SELLER),
    SETTLEMENT_APPROVE("SETTLEMENT_APPROVE", Domain.SELLER),
    /**
     * 运费模板的建、改、启用、归档。
     *
     * <p>不并进 {@link #PRODUCT_WRITE}：商品编辑和"改买家要付多少运费"是两种爆炸半径。
     * 一个只该上架商品的运营，不该顺手把包邮门槛从 99 改成 199。
     */
    SHIPPING_MANAGE("SHIPPING_MANAGE", Domain.SELLER),

    // —— 平台域（平台员工，岗位授予）——
    SHOP_REVIEW("SHOP_REVIEW", Domain.ADMIN),
    SHOP_GOVERNANCE("SHOP_GOVERNANCE", Domain.ADMIN),
    CATEGORY_MANAGE("CATEGORY_MANAGE", Domain.ADMIN),
    PRODUCT_REVIEW("PRODUCT_REVIEW", Domain.ADMIN),
    CMS_MANAGE("CMS_MANAGE", Domain.ADMIN),
    /**
     * 人工补录物流轨迹（/api/admin/logistics/traces）。
     *
     * <p>能推进包裹到"已签收"并触发订单完成与结算解冻，和承运商推送口同等危险；
     * 员工身份就是签名，不再叠加渠道密钥。
     */
    LOGISTICS_MANAGE("LOGISTICS_MANAGE", Domain.ADMIN),
    COUPON_OPS("COUPON_OPS", Domain.ADMIN),
    /**
     * 平台促销规则的配置与上下线。
     *
     * <p>和 {@link #COUPON_OPS} 分开：券是发给某一个人的，满减是改所有人看到的价格。
     * 能发券的人不一定该能改价，所以权限点不合并。
     */
    PROMOTION_MANAGE("PROMOTION_MANAGE", Domain.ADMIN),
    /**
     * 查看对账结果。
     *
     * <p>只授 SUPER_ADMIN：报告会把"哪些账户余额对不上"整页摊开，那是全平台的资金结构。
     */
    LEDGER_VIEW("LEDGER_VIEW", Domain.ADMIN),
    AUDIT_VIEW("AUDIT_VIEW", Domain.ADMIN),
    /**
     * 平台员工与岗位管理。只管员工，不管买家——封买家是 {@link #BUYER_MANAGE}。
     */
    STAFF_MANAGE("STAFF_MANAGE", Domain.ADMIN),
    /**
     * 买家账号封禁 / 解封。
     *
     * <p>和 {@link #STAFF_MANAGE} 分开，尽管两者都是"封人"。合并的后果是：能管员工的人顺手能封全体买家，
     * 而这两件事的爆炸半径差三个数量级——员工几十个，买家是全平台。
     *
     * <p>不标 {@code risk_level = 'high'}：high 的语义是「动钱出口收窄到一个人」，封号不动钱。
     * 它仍然只授 SUPER_ADMIN，靠 {@code staff.role_permission} 的授权表表达，不靠 risk_level。
     */
    BUYER_MANAGE("BUYER_MANAGE", Domain.ADMIN),
    /**
     * 手动触发定时任务（事件补发 / 对账 / 各类清理 / 超时关单等）。
     *
     * <p>授 OPS：它是运维动作不是业务操作，能点这个按钮的应该正是盯着
     * {@code shop.job.*} 指标的人。触发与定时调度走同一条路径，锁与幂等不变。
     */
    JOB_TRIGGER("JOB_TRIGGER", Domain.ADMIN),
    /**
     * 事件重放：查看未完成的事件登记、把重投次数超限的单条事件清零放行。
     *
     * <p>不并进 {@link #JOB_TRIGGER}：触发任务是"让既定流程立刻跑一轮"，重放是"让一条
     * 已被判死的事件重新生效"，后者直接改写业务后果。
     */
    EVENT_REPLAY("EVENT_REPLAY", Domain.ADMIN),
    /**
     * 挂账待查的清单、手动退款与驳回——"钱到了但推进不了"的统一出口。
     *
     * <p>只授 SUPER_ADMIN：这是动真钱的出口。挂账行里躺着迟到回调的真金白银。
     */
    SUSPENSE_MANAGE("SUSPENSE_MANAGE", Domain.ADMIN),
    /**
     * 查看违规线索（履约超时等）。只读——处置（扣分/限流）还没做，先让人看见。
     */
    GOVERNANCE_REVIEW("GOVERNANCE_REVIEW", Domain.ADMIN),
    RUM_VIEW("RUM_VIEW", Domain.ADMIN);

    /** 身份域。与库里 {@code common.permission.domain} 的值一一对应。 */
    public enum Domain {
        /** 平台员工（{@code staff} 模块），岗位授予 */
        ADMIN("admin"),
        /** 店铺账号（{@code seller} 模块），店主授予子账号 */
        SELLER("seller");

        private final String dbValue;

        Domain(String dbValue) {
            this.dbValue = dbValue;
        }

        public String dbValue() {
            return dbValue;
        }
    }

    private final String code;
    private final Domain domain;

    Permission(String code, Domain domain) {
        this.code = code;
        this.domain = domain;
    }

    public String code() {
        return code;
    }

    public Domain domain() {
        return domain;
    }

    /** 某个域的全部码。卖家侧解析只授自己域的点——不给"整张表"这种口子。 */
    public static Set<String> codesOf(Domain domain) {
        return Arrays.stream(values())
                .filter(permission -> permission.domain == domain)
                .map(Permission::code)
                .collect(Collectors.toUnmodifiableSet());
    }
}
