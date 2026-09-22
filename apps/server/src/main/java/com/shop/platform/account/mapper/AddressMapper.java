package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
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
     * 清零本人所有地址的默认标记（创建/更新/设默认前调用），保证每用户至多一个默认；
     * 并发由部分唯一索引兜底。
     *
     * @return 影响行数
     */
    default int clearDefault(UUID userId) {
        return update(
                null,
                new LambdaUpdateWrapper<Address>()
                        .eq(Address::getUserId, userId)
                        .set(Address::getIsDefault, false));
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
