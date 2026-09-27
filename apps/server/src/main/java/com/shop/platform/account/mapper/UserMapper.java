package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.model.UserStatus;
import com.shop.platform.common.PageParams;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserMapper extends BaseMapper<User> {

    /** 按手机号查账号：短信注册回读 / 密码登录 / 改密共用（phone 全局唯一） */
    default User selectByPhone(String phone) {
        return selectOne(new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
    }

    /**
     * 管理端买家列表分页：新注册在前（创建时间倒序）。
     *
     * <p>status 传 null = 全部档（含已注销的 DISABLED——注销主体要被管理端看见，本表刻意不给 deletedAt 贴
     * {@code @TableLogic}，故这里不会悄悄少一批行）。
     *
     * <p>keyword 是「手机号<b>或</b>昵称任一命中」的一条 OR，两列都按库中原值做包含匹配：库里存的是号码明文，
     * 脱敏只发生在出参那一侧（折成 AdminUserItem 时 mask）——拿脱敏后的形状去 LIKE 永远匹配不上。
     */
    default Page<User> selectPageAdmin(PageParams pageParams, UserStatus status, String keyword) {
        return selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<User>()
                        .eq(status != null, User::getStatus, status)
                        .and(
                                keyword != null,
                                q -> q.like(User::getPhone, keyword).or().like(User::getNickname, keyword))
                        .orderByDesc(User::getCreatedAt));
    }

    /**
     * 提交注销申请（落冷静期起点）：只放「未注销 + 没提过申请」的 ACTIVE 行。
     *
     * <p>状态条件不是冗余：禁用中的账号不能自助注销（治理留痕优先，ACC-76），而封号与申请可能同刻发生
     */
    default int markDeletionRequested(UUID userId, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<User>()
                        .eq(User::getId, userId)
                        .eq(User::getStatus, UserStatus.ACTIVE)
                        .isNull(User::getDeletedAt)
                        .isNull(User::getDeletionRequestedAt)
                        .set(User::getDeletionRequestedAt, now)
                        .set(User::getUpdatedAt, now));
    }

    /** 撤销注销申请（冷静期内）：清了申请时刻，账号就此完全复原（期内什么都没动过） */
    default int cancelDeletion(UUID userId, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<User>()
                        .eq(User::getId, userId)
                        .isNull(User::getDeletedAt)
                        .isNotNull(User::getDeletionRequestedAt)
                        .set(User::getDeletionRequestedAt, null)
                        .set(User::getUpdatedAt, now));
    }

    /**
     * 管理端设置账号状态（禁用/启用，ACC-16 两态）：只推进 {@code status} 一列。
     *
     * <p>刻意不是「读整行 → 改 status → updateById」：读与写之间这笔账号可能刚被登录刷过时间戳、或已被注销
     * 流程匿名化（手机号已释放、哈希已清空），整行回写会把那些旧值原样带回去。
     *
     * <p>两道守卫各挡一件具体的事，都不冗余：
     * <ul>
     *   <li>{@code status <> target}——同一道命令重复下发影响 0 行，也就不会往账本里补一行「没发生过的变更」
     *       （口径同 {@code StaffService.updateStaffRole} 的「同岗位是空动作」）；起点与目标互斥，故不必额外传起点。
     *   <li>{@code deleted_at IS NULL}——注销主体在管理端列表里可见（本表刻意不加 @TableLogic），照旧口径
     *       给它下「启用」会撞 {@code ck_users_deletion_state}（V64：有生效时刻的行不得留在 ACTIVE）变成 500。
     * </ul>
     * 0 行的后果（409）由调用方裁决。
     */
    default int updateStatus(UUID userId, UserStatus target, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<User>()
                        .eq(User::getId, userId)
                        .ne(User::getStatus, target)
                        .isNull(User::getDeletedAt)
                        .set(User::getStatus, target)
                        .set(User::getUpdatedAt, now));
    }

    /**
     * 登录/刷新回写最后登录时刻：只碰 {@code last_login_at} 一列。
     *
     * <p>这里是「每次凭证动作都要写一行」最热的一条，写整行等于把读到的旧快照写回去——与并发的封号相撞会把
     * 状态改回 ACTIVE（封号失效），与注销流程相撞会把已抹掉的手机号写回去（号码被占用、主体复活）。
     * 只更新一列，两条串写各自只覆盖自己那一列，不再有先后之分。
     *
     * <p>条件更新走 wrapper 而非 {@code updateById}，故 {@code updated_at} 不会被自动填充，手写（口径同
     * {@link #anonymize}）。0 行 = 账号在这一步之间被注销流程撤走，不影响发token，调用方不判。
     */
    default int touchLastLogin(UUID userId, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<User>()
                        .eq(User::getId, userId)
                        .set(User::getLastLoginAt, now)
                        .set(User::getUpdatedAt, now));
    }

    /**
     * 换口令：只写 {@code password_hash} 一列。与 {@link #updateStatus} 同一理由——整行回写会把读快照里的
     * {@code status} 带回旧值（管理员刚禁的号被改密动作解封）。
     *
     * <p>{@code deleted_at IS NULL} 是必须的：注销流程显式把哈希抹成 null（见 {@link #anonymize}），
     * 在途 access token 那 10 分钟窗口里的改密请求不能把哈希写回一个已释放的号码上。
     */
    default int updatePasswordHash(UUID userId, String passwordHash, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<User>()
                        .eq(User::getId, userId)
                        .isNull(User::getDeletedAt)
                        .set(User::getPasswordHash, passwordHash)
                        .set(User::getUpdatedAt, now));
    }

    /**
     * 改资料：昵称与头像各写各的，其余列一律不碰。
     *
     * <p>头像要由 {@code changeAvatar} 明说而不是看值：清空头像的目标值是 null，而 wrapper 的
     * {@code set(值 != null, ...)} 会把「清空」判成「不改」——这正是 {@code updateById} 按非空字段拼 SQL
     * 的同一条陷阱（见 {@link #anonymize} 为何要显式 {@code set(..., null)}）。
     *
     * <p>只碰未注销的活体（{@code deleted_at IS NULL}）：0 行即账号在读与写之间被注销流程收走，
     * 由调用方报 404，不能对着匿名化后的主体报「改好了」。
     */
    default int updateProfile(
            UUID userId, String nickname, boolean changeAvatar, String avatarKey, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<User>()
                        .eq(User::getId, userId)
                        .isNull(User::getDeletedAt)
                        .set(nickname != null, User::getNickname, nickname)
                        .set(changeAvatar, User::getAvatarKey, avatarKey)
                        .set(User::getUpdatedAt, now));
    }

    /**
     * 执行注销：匿名化 + 状态推进 + 生效时刻，<b>一笔</b>条件更新完成。
     *
     * <p>合成一笔的理由：这几列之间有 CHECK 约束（有生效时刻的行不得留在 ACTIVE），分开写必然出现中间态；
     * 且「期内被封号则不执行」这条裁决靠 {@code status = ACTIVE} 条件承担——0 行即没注销，不报错也不重试。
     *
     * <p>密码哈希与头像必须显式置 null：条件更新走 wrapper 而非 {@code updateById}，后者按非空字段拼 SQL，
     * 空值会被跳过（等于注销后密码还在）。同理 {@code updated_at} 不会被自动填充，手写。
     *
     * @param phone 占位手机号：号码就此释放，同一手机号可重新注册成新主体
     * @param requestedBefore 冷静期上界，重复 selectDeletionDue 的判定，防「select 与 update 之间被撤销」
     */
    default int anonymize(
            UUID userId, String phone, String nickname, OffsetDateTime requestedBefore, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<User>()
                        .eq(User::getId, userId)
                        .eq(User::getStatus, UserStatus.ACTIVE)
                        .isNull(User::getDeletedAt)
                        .isNotNull(User::getDeletionRequestedAt)
                        .le(User::getDeletionRequestedAt, requestedBefore)
                        .set(User::getPhone, phone)
                        .set(User::getPasswordHash, null)
                        .set(User::getNickname, nickname)
                        .set(User::getAvatarKey, null)
                        .set(User::getStatus, UserStatus.DISABLED)
                        .set(User::getDeletedAt, now)
                        .set(User::getUpdatedAt, now));
    }

    /**
     * 到期未撤销的注销申请（定时扫描）：只挑 ACTIVE 行——冷静期内被平台禁用的账号交给治理流程，
     * 注销不成为「抹掉追踪线索」的出口。
     */
    @Select(
            """
            SELECT id FROM account.users
            WHERE deleted_at IS NULL AND status = 'ACTIVE'
              AND deletion_requested_at IS NOT NULL AND deletion_requested_at <= #{cutoff}
            ORDER BY deletion_requested_at
            LIMIT #{batchSize}
            """)
    List<UUID> selectDeletionDue(@Param("cutoff") OffsetDateTime cutoff, @Param("batchSize") int batchSize);
}
