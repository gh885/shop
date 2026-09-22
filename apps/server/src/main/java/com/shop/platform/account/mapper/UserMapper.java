package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.account.model.UserStatus;
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
