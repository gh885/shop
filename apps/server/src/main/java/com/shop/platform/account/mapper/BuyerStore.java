package com.shop.platform.account.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 买家账号的读写。
 *
 * <p>只返回「还在用的账号」给登录用——被停用/已注销的账号在登录这一步就该消失，不能等到判权时才拦。
 * 查历史订单走 {@link #find}，那个不筛状态：停用的人也要能看自己的订单，注销的人也要能被订单指回。
 */
@Component
public class BuyerStore {

    private static final String FIND_ACTIVE_BY_PHONE =
            """
            SELECT id AS buyer_id, phone, password_hash, nickname
              FROM account.buyer
             WHERE phone = :phone AND status = 'active' AND deleted_at IS NULL
            """;

    private static final String FIND_BY_PHONE =
            """
            SELECT id AS buyer_id, password_hash, status, last_login_at
              FROM account.buyer
             WHERE phone = :phone AND deleted_at IS NULL
            """;

    private static final String FIND =
            """
            SELECT id AS buyer_id, phone, nickname, status, deletion_requested_at, deleted_at
              FROM account.buyer
             WHERE id = :id
            """;

    private static final String FIND_PASSWORD_HASH =
            """
            SELECT password_hash FROM account.buyer WHERE id = :id AND deleted_at IS NULL
            """;

    private static final String INSERT =
            """
            INSERT INTO account.buyer (id, phone, password_hash, nickname)
            VALUES (:id, :phone, :passwordHash, :nickname)
            """;

    private static final String TOUCH_LAST_LOGIN =
            """
            UPDATE account.buyer SET last_login_at = :now WHERE id = :id
            """;

    private static final String UPDATE_PASSWORD_HASH =
            """
            UPDATE account.buyer SET password_hash = :passwordHash WHERE id = :id AND deleted_at IS NULL
            """;

    private static final String UPDATE_NICKNAME =
            """
            UPDATE account.buyer SET nickname = :nickname WHERE id = :id AND deleted_at IS NULL
            """;

    private static final String MARK_DELETION_REQUESTED =
            """
            UPDATE account.buyer
               SET deletion_requested_at = :now
             WHERE id = :id AND deleted_at IS NULL AND deletion_requested_at IS NULL
            """;

    private static final String CANCEL_DELETION =
            """
            UPDATE account.buyer
               SET deletion_requested_at = NULL
             WHERE id = :id AND deleted_at IS NULL AND deletion_requested_at IS NOT NULL
            """;

    private static final String SELECT_DELETION_DUE =
            """
            SELECT id FROM account.buyer
             WHERE deleted_at IS NULL AND deletion_requested_at IS NOT NULL AND deletion_requested_at <= :cutoff
            """;

    private static final String ANONYMIZE =
            """
            UPDATE account.buyer
               SET deleted_at = :now,
                   phone = :reservedPhone,
                   nickname = :deletedNickname,
                   password_hash = NULL,
                   deletion_requested_at = NULL
             WHERE id = :id AND deleted_at IS NULL
               AND deletion_requested_at IS NOT NULL AND deletion_requested_at <= :cutoff
            """;

    private static final RowMapper<Credentials> CREDENTIALS = RowMappers.of(Credentials.class);

    private static final RowMapper<PhoneRow> PHONE = RowMappers.of(PhoneRow.class);

    private static final RowMapper<BuyerRow> BUYER = RowMappers.of(BuyerRow.class);

    private final JdbcClient jdbc;

    public BuyerStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 密码登录用：只认 active 且未注销。 */
    public Optional<Credentials> findActiveByPhone(String phone) {
        return jdbc.sql(FIND_ACTIVE_BY_PHONE)
                .param("phone", phone)
                .query(CREDENTIALS)
                .optional();
    }

    /** 短信登录用：注销的按「不存在」处理（号码已释放），停用的放行给 service 的状态闸门拦。 */
    public Optional<PhoneRow> findByPhone(String phone) {
        return jdbc.sql(FIND_BY_PHONE).param("phone", phone).query(PHONE).optional();
    }

    /** 查人，不筛状态——停用买家也要能看自己的订单。 */
    public Optional<BuyerRow> find(UUID buyerId) {
        return jdbc.sql(FIND).param("id", buyerId).query(BUYER).optional();
    }

    /** 设密/改密用：当前密码哈希（可能为 null = 从未设过）。 */
    public Optional<String> findPasswordHash(UUID buyerId) {
        return jdbc.sql(FIND_PASSWORD_HASH)
                .param("id", buyerId)
                .query(String.class)
                .optional();
    }

    public void insert(UUID id, String phone, String passwordHash, String nickname) {
        jdbc.sql(INSERT)
                .param("id", id)
                .param("phone", phone)
                .param("passwordHash", passwordHash)
                .param("nickname", nickname)
                .update();
    }

    public void touchLastLogin(UUID id, OffsetDateTime now) {
        jdbc.sql(TOUCH_LAST_LOGIN).param("id", id).param("now", now).update();
    }

    /** 只写哈希一列：整行回写会把管理员刚落的 status 带回读到的旧值。返回是否命中（未注销）。 */
    public boolean updatePasswordHash(UUID id, String passwordHash) {
        return jdbc.sql(UPDATE_PASSWORD_HASH)
                        .param("id", id)
                        .param("passwordHash", passwordHash)
                        .update()
                == 1;
    }

    public boolean updateNickname(UUID id, String nickname) {
        return jdbc.sql(UPDATE_NICKNAME)
                        .param("id", id)
                        .param("nickname", nickname)
                        .update()
                == 1;
    }

    /** 落注销申请。返回 0 = 已在冷静期中或已注销（并发/重复申请），调用方折 409。 */
    public boolean markDeletionRequested(UUID id, OffsetDateTime now) {
        return jdbc.sql(MARK_DELETION_REQUESTED)
                        .param("id", id)
                        .param("now", now)
                        .update()
                == 1;
    }

    /** 撤销注销申请。返回 0 = 没有待生效的申请。 */
    public boolean cancelDeletion(UUID id) {
        return jdbc.sql(CANCEL_DELETION).param("id", id).update() == 1;
    }

    /** 冷静期已满的注销申请，逐笔独立执行，一笔失败不牵连其余。 */
    public List<UUID> selectDeletionDue(OffsetDateTime cutoff) {
        return jdbc.sql(SELECT_DELETION_DUE)
                .param("cutoff", cutoff)
                .query(UUID.class)
                .list();
    }

    /**
     * 匿名化（条件更新，天然幂等）：多实例并发扫描同一行只有一个赢。
     * 手机号换成占位串——号码要交还电信循环放号后的下一个人，原值留不得。
     */
    public boolean anonymize(
            UUID id, String reservedPhone, String deletedNickname, OffsetDateTime cutoff, OffsetDateTime now) {
        return jdbc.sql(ANONYMIZE)
                        .param("id", id)
                        .param("reservedPhone", reservedPhone)
                        .param("deletedNickname", deletedNickname)
                        .param("cutoff", cutoff)
                        .param("now", now)
                        .update()
                == 1;
    }

    /** 地址簿硬删（注销时）：订单只持有快照，没有任何行引用地址簿，留着只会白养数据。 */
    public void deleteAddresses(UUID buyerId) {
        jdbc.sql("DELETE FROM account.addresses WHERE buyer_id = :buyerId")
                .param("buyerId", buyerId)
                .update();
    }

    /** 密码登录的凭证投影。password_hash 可空：短信注册的账号可能还没设密码。 */
    public record Credentials(UUID buyerId, String phone, String passwordHash, String nickname) {}

    /** 短信登录的投影：有没有密码、什么状态、多久没活跃，决定走注册分支、状态闸门还是休眠闸门。 */
    public record PhoneRow(UUID buyerId, String passwordHash, String status, OffsetDateTime lastLoginAt) {

        public boolean active() {
            return "active".equals(status);
        }
    }

    public record BuyerRow(
            UUID buyerId,
            String phone,
            String nickname,
            String status,
            OffsetDateTime deletionRequestedAt,
            OffsetDateTime deletedAt) {

        /** 注销算「不在用」：下单会被拒，但历史订单仍能查。 */
        public boolean active() {
            return "active".equals(status) && deletedAt == null;
        }
    }
}
