package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AddressMapper extends BaseMapper<Address> {

    /** 我的地址列表：默认地址置顶，其余按创建时间倒序 */
    default List<Address> selectByUser(UUID userId) {
        return selectList(new LambdaQueryWrapper<Address>()
                .eq(Address::getUserId, userId)
                .orderByDesc(Address::getIsDefault)
                .orderByDesc(Address::getCreatedAt));
    }

    /**
     * 本人<b>未删</b>地址条数（条数上限闸门，ACC-53「软删不占名额」）。
     *
     * <p>不需要显式写 deleted_at 条件：Address 的 deletedAt 贴了 {@code @TableLogic}，selectCount 会自动带上
     * 「未删」那半句，与 {@link #selectByUser} 同一套过滤——计数与列表看到的永远是同一批行。
     */
    default long countByUser(UUID userId) {
        return selectCount(new LambdaQueryWrapper<Address>().eq(Address::getUserId, userId));
    }

    /**
     * 清零本人所有地址的默认标记（创建/更新/设默认前调用），保证每用户至多一个默认；
     * 并发由部分唯一索引兜底。
     *
     * <p>WHERE 带上 {@code is_default = true}：只碰真正是默认的那一行，不给整本地址簿每行都刷一遍；
     * 这也让它成为一条「真 → 假」的条件转移——默认标记因此是第二写者列，实体上标了 NEVER。
     *
     * @return 影响行数
     */
    default int clearDefault(UUID userId) {
        return update(
                null,
                new LambdaUpdateWrapper<Address>()
                        .eq(Address::getUserId, userId)
                        .eq(Address::getIsDefault, true)
                        .set(Address::getIsDefault, false));
    }

    /**
     * 给本人某条地址置 / 取消默认标记，回影响行数；置真前调用方先 {@link #clearDefault}。
     *
     * <p>{@code is_default} 标了 NEVER，实体路径写不进去：编辑地址的 {@code updateById} 只管地址本体，默认标记只走
     * 这里与 {@link #clearDefault}。{@code WHERE user_id} 是归属闸门；「每人至多一个」仍由部分唯一索引兜底，
     * 并发置真撞索引由调用方折成 409。
     */
    default int setDefaultFlag(UUID userId, UUID id, boolean isDefault, OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<Address>()
                        .eq(Address::getId, id)
                        .eq(Address::getUserId, userId)
                        .set(Address::getIsDefault, isDefault)
                        .set(Address::getUpdatedAt, now));
    }

    /**
     * 清掉本人全部地址（注销时用，ACC-76）：地址簿里是收件人姓名 + 电话 + 详址，是本人数据里最实的一部分，
     * 注销必须带走。
     *
     * <p>走 {@code delete} 而不是手写 SET：Address 的 deletedAt 贴了 {@code @TableLogic}，
     * MyBatis-Plus 会把这条翻译成软删（delval=NOW()）并自动带上「未删」条件——与用户自己删地址同一条路，
     * 不出现第二套删除口径。
     */
    default int softDeleteByUser(UUID userId) {
        return delete(new LambdaQueryWrapper<Address>().eq(Address::getUserId, userId));
    }
}
