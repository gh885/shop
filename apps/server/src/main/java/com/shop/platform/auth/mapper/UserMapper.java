package com.shop.platform.auth.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper extends BaseMapper<User> {

    /** 按手机号查账号：短信注册回读 / 密码登录 / 改密共用（phone 全局唯一） */
    default User selectByPhone(String phone) {
        return selectOne(new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
    }
}
