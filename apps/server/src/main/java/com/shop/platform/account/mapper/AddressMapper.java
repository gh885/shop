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
}
