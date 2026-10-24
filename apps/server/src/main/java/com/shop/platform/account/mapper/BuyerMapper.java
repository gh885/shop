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
            SELECT id AS buyerId, phone, password_hash AS passwordHash, nickname
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
            SELECT id AS buyerId, phone, nickname, status,
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
            INSERT INTO account.buyer (id, phone, password_hash, nickname)
            VALUES (#{id}, #{phone}, #{passwordHash}, #{nickname})
            """)
    void insert(
            @Param("id") UUID id,
            @Param("phone") String phone,
            @Param("passwordHash") String passwordHash,
            @Param("nickname") String nickname);

    @Update("UPDATE account.buyer SET last_login_at = #{now} WHERE id = #{id}")
    void touchLastLogin(@Param("id") UUID id, @Param("now") OffsetDateTime now);

    /** 只写哈希一列：整行回写会把管理员刚落的 status 带回读到的旧值。返回是否命中（未注销）。 */
    @Update("UPDATE account.buyer SET password_hash = #{passwordHash} WHERE id = #{id} AND deleted_at IS NULL")
    boolean updatePasswordHash(@Param("id") UUID id, @Param("passwordHash") String passwordHash);

    @Update("UPDATE account.buyer SET nickname = #{nickname} WHERE id = #{id} AND deleted_at IS NULL")
    boolean updateNickname(@Param("id") UUID id, @Param("nickname") String nickname);

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
                   nickname = #{deletedNickname},
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

    /** 密码登录的凭证投影。password_hash 可空：短信注册的账号可能还没设密码。 */
    record Credentials(UUID buyerId, String phone, String passwordHash, String nickname) {}

    /** 短信登录的投影：有没有密码、什么状态、多久没活跃，决定走注册分支、状态闸门还是休眠闸门。 */
    record PhoneRow(UUID buyerId, String passwordHash, String status, OffsetDateTime lastLoginAt) {

        public boolean active() {
            return "active".equals(status);
        }
    }

    record BuyerRow(
            UUID buyerId,
            String phone,
            String nickname,
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
