package com.shop.platform.account.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 买家账号的读写。
 *
 * <p>只返回「还在用的账号」给登录用——被停用/已注销的账号在登录这一步就该消失，不能等到判权时才拦。
 * 查历史订单走 {@link #find}，那个不筛状态：停用的人也要能看自己的订单，注销的人也要能被订单指回。
 *
 * <p>读全是窄投影（登录只要凭证、判活只要状态列），不值得整行实体，record 按构造器参数名对列。
 */
@Mapper
public interface BuyerMapper {

    /** 密码登录用：只认 active 且未注销。 */
    @Select(
            """
            SELECT id AS buyerId, phone, password_hash AS passwordHash, display_name
              FROM account.buyer
             WHERE phone = #{phone} AND status = 'active' AND deleted_at IS NULL
            """)
    Optional<Credentials> findActiveByPhone(@Param("phone") String phone);

    /** 短信登录用：注销的按「不存在」处理（号码已释放），停用的放行给 service 的状态闸门拦。 */
    @Select(
            """
            SELECT id AS buyerId, password_hash AS passwordHash, status, last_login_at AS lastLoginAt
              FROM account.buyer
             WHERE phone = #{phone} AND deleted_at IS NULL
            """)
    Optional<PhoneRow> findByPhone(@Param("phone") String phone);

    /** 查人，不筛状态——停用买家也要能看自己的订单。 */
    @Select(
            """
            SELECT id AS buyerId, phone, display_name, status,
                   deletion_requested_at AS deletionRequestedAt, deleted_at AS deletedAt,
                   permission_version AS permissionVersion
              FROM account.buyer
             WHERE id = #{id}
            """)
    Optional<BuyerRow> find(@Param("id") UUID buyerId);

    /** 设密/改密用：当前密码哈希（可能为 null = 从未设过）。 */
    @Select("SELECT password_hash FROM account.buyer WHERE id = #{id} AND deleted_at IS NULL")
    Optional<String> findPasswordHash(@Param("id") UUID buyerId);

    @Insert(
            """
            INSERT INTO account.buyer (id, phone, password_hash, display_name)
            VALUES (#{id}, #{phone}, #{passwordHash}, #{displayName})
            """)
    void insert(
            @Param("id") UUID id,
            @Param("phone") String phone,
            @Param("passwordHash") String passwordHash,
            @Param("displayName") String displayName);

    @Update("UPDATE account.buyer SET last_login_at = #{now} WHERE id = #{id}")
    void touchLastLogin(@Param("id") UUID id, @Param("now") OffsetDateTime now);

    /** 只写哈希一列：整行回写会把管理员刚落的 status 带回读到的旧值。返回是否命中（未注销）。 */
    @Update("UPDATE account.buyer SET password_hash = #{passwordHash} WHERE id = #{id} AND deleted_at IS NULL")
    boolean updatePasswordHash(@Param("id") UUID id, @Param("passwordHash") String passwordHash);

    @Update("UPDATE account.buyer SET display_name = #{displayName} WHERE id = #{id} AND deleted_at IS NULL")
    boolean updateDisplayName(@Param("id") UUID id, @Param("displayName") String displayName);

    /**
     * 写语言偏好。{@code null} 是合法值（清回「没表过态」），所以这里无条件覆盖而不是条件更新——
     * 条件更新会把 null 当成"没传"漏掉，而调用方要表达的正是"清空"。
     */
    @Update("UPDATE account.buyer SET preferred_locale = #{preferredLocale} WHERE id = #{id} AND deleted_at IS NULL")
    boolean updatePreferredLocale(@Param("id") UUID id, @Param("preferredLocale") String preferredLocale);

    /** 读语言偏好。列可空，查无此人时返回 empty——两种"没有"调用方都按缺省处理。 */
    @Select("SELECT preferred_locale FROM account.buyer WHERE id = #{id} AND deleted_at IS NULL")
    Optional<String> findPreferredLocale(@Param("id") UUID id);

    /**
     * 平台封禁 / 解封（{@code BUYER_MANAGE}）。
     *
     * <p><b>条件更新，0 行是判决：</b> {@code status <> #{target}} 让“已经封了再封一次”和
     * “并发两个管理员同时封”都退化成 0 行，调用方据它回 409 而不是静默成功。
     *
     * <p><b>不封已注销的账号：</b> {@code deleted_at IS NULL}。注销是买家自己的意思表示，
     * 平台不该对一个已经匿名化的主体下封禁——而且那行里手机号已经是占位串，封它没有意义。
     *
     * <p><b>同时 bump permission_version：</b> 封禁改变身份解析结果（{@code BuyerOperatorResolver}
     * 按 {@code status} 滤），是“影响快照的写”。现在没缓存所以只是记一笔，
     * 但漏 bump 的代价会在加缓存后变成“封了人还能继续用”——那时才查就太晚了。
     *
     * <p><b>{@code <>/!=} 写成 {@code !=}。</b> 这条注解没有 {@code <script>} 包着，
     * 所以 {@code &lt;} 不会被反转义——MyBatis 会把 {@code &lt;} 当普通文本发给 PG，
     * 报的是 {@code column "lt" does not exist}。{@code !=} 在 PostgreSQL 里与 {@code <>} 等价。
     *
     * @return 是否真的改了一行。false = 已经是目标状态 / 账号已注销 / 并发抢先
     */
    @Update(
            """
            UPDATE account.buyer
               SET status = #{target},
                   permission_version = permission_version + 1
             WHERE id = #{id} AND deleted_at IS NULL AND status != #{target}
            """)
    boolean updateStatus(@Param("id") UUID id, @Param("target") String target);

    /** 落注销申请。返回 false = 已在冷静期中或已注销（并发/重复申请），调用方折 409。 */
    @Update(
            """
            UPDATE account.buyer
               SET deletion_requested_at = #{now}
             WHERE id = #{id} AND deleted_at IS NULL AND deletion_requested_at IS NULL
            """)
    boolean markDeletionRequested(@Param("id") UUID id, @Param("now") OffsetDateTime now);

    /** 撤销注销申请。返回 false = 没有待生效的申请。 */
    @Update(
            """
            UPDATE account.buyer
               SET deletion_requested_at = NULL
             WHERE id = #{id} AND deleted_at IS NULL AND deletion_requested_at IS NOT NULL
            """)
    boolean cancelDeletion(@Param("id") UUID id);

    /** 冷静期已满的注销申请，逐笔独立执行，一笔失败不牵连其余。 */
    @Select(
            """
            SELECT id FROM account.buyer
             WHERE deleted_at IS NULL AND deletion_requested_at IS NOT NULL AND deletion_requested_at <= #{cutoff}
            """)
    List<UUID> selectDeletionDue(@Param("cutoff") OffsetDateTime cutoff);

    /**
     * 匿名化（条件更新，天然幂等）：多实例并发扫描同一行只有一个赢。
     * 手机号换成占位串——号码要交还电信循环放号后的下一个人，原值留不得。
     */
    @Update(
            """
            UPDATE account.buyer
               SET deleted_at = #{now},
                   phone = #{reservedPhone},
                   displayName = #{deletedNickname},
                   password_hash = NULL,
                   deletion_requested_at = NULL,
                   permission_version = permission_version + 1
             WHERE id = #{id} AND deleted_at IS NULL
               AND deletion_requested_at IS NOT NULL AND deletion_requested_at <= #{cutoff}
            """)
    boolean anonymize(
            @Param("id") UUID id,
            @Param("reservedPhone") String reservedPhone,
            @Param("deletedNickname") String deletedNickname,
            @Param("cutoff") OffsetDateTime cutoff,
            @Param("now") OffsetDateTime now);

    /**
     * 后台买家列表。
     *
     * <p><b>为什么需要它。</b> 封禁接口只收 {@code buyerId}，但管理员手里没有那个 id——
     * 他手里只有“有人投诉这个手机号刷单”。没有列表就只能靠 SQL 查库，那封禁入口就是半个入口。
     *
     * <p><b>手机号脱敏。</b> 列表页会把 20–100 个手机号一次摊在屏幕上，那是可以直接拿去营销/撞库的数据。
     * 管理员要的是“认出是哪个号”，不是“拿到完整号码”——{@code 138****5678} 够认。
     * 真要看完整号码是另一件事（带审计的查看动作），不该顺带在列表里给。
     *
     * <p>搜关键字同时匹配手机号与昵称：管理员两种都可能知道。
     */
    @Select(
            """
            <script>
            SELECT id AS buyerId, phone, display_name AS displayName, status, created_at AS createdAt
              FROM account.buyer
             WHERE deleted_at IS NULL
            <if test="status != null">
               AND status = #{status}
            </if>
            <if test="keyword != null">
               AND (phone LIKE '%' || #{keyword} || '%' OR display_name ILIKE '%' || #{keyword} || '%')
            </if>
            <if test="beforeCreatedAt != null">
               AND (created_at, id) &lt; (#{beforeCreatedAt}, #{beforeId})
            </if>
             ORDER BY created_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """)
    List<AdminBuyerRow> listForAdmin(
            @Param("status") String status,
            @Param("keyword") String keyword,
            @Param("beforeCreatedAt") OffsetDateTime beforeCreatedAt,
            @Param("beforeId") UUID beforeId,
            @Param("limit") int limit);

    /**
     * 后台买家列表的一行。{@code phone} 是**明文**，脱敏在 service 边界做——
     * 让 SQL 返回掩码串的话，将来任何一个需要原值的场景（比如导出对账）都得绕过这层。
     */
    record AdminBuyerRow(UUID buyerId, String phone, String displayName, String status, OffsetDateTime createdAt) {}

    /** 密码登录的凭证投影。password_hash 可空：短信注册的账号可能还没设密码。 */
    record Credentials(UUID buyerId, String phone, String passwordHash, String displayName) {}

    /** 短信登录的投影：有没有密码、什么状态、多久没活跃，决定走注册分支、状态闸门还是休眠闸门。 */
    record PhoneRow(UUID buyerId, String passwordHash, String status, OffsetDateTime lastLoginAt) {

        public boolean active() {
            return "active".equals(status);
        }
    }

    record BuyerRow(
            UUID buyerId,
            String phone,
            String displayName,
            String status,
            OffsetDateTime deletionRequestedAt,
            OffsetDateTime deletedAt,
            long permissionVersion) {

        /** 注销算「不在用」：下单会被拒，但历史订单仍能查。 */
        public boolean active() {
            return "active".equals(status) && deletedAt == null;
        }
    }
}
