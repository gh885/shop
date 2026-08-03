package com.shop.platform.infra;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.postgresql.util.PGobject;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * jsonb ↔ List&lt;T&gt; 的共享基类：PGobject 绑定为 jsonb 类型（varchar→jsonb 会报错，须绑 jsonb 类型）+ 固定 TypeReference 反序列化。
 *
 * <p>为什么每个形状一个子类：MyBatis 经 @TableField(typeHandler=X.class) 无参实例化，TypeReference 无法由注解传入；
 * 内置 JacksonTypeHandler 只收裸 Class，List&lt;SpecItem&gt; 会擦除成 List&lt;LinkedHashMap&gt;。子类只声明 typeRef()，JSON 逻辑全在基类。
 *
 * <p>各业务模块在自己的 mapper 包写形状子类（如 product 模块的 JsonbSpecItemsHandler），跨模块不 import 对方 mapper。
 * 查询路径记得配合实体 @TableName(autoResultMap = true)，否则 select 不会走这里的 handler。
 */
public abstract class JsonbListTypeHandler<T> extends BaseTypeHandler<List<T>> {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    /** 子类声明具体形状，如 new TypeReference&lt;List&lt;SpecItem&gt;&gt;() {}，保住泛型信息 */
    protected abstract TypeReference<List<T>> typeRef();

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<T> parameter, JdbcType jdbcType)
            throws SQLException {
        try {
            PGobject json = new PGobject();
            json.setType("jsonb");
            json.setValue(MAPPER.writeValueAsString(parameter));
            ps.setObject(i, json);
        } catch (JacksonException e) {
            throw new SQLException("JSON 序列化失败", e);
        }
    }

    @Override
    public List<T> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getString(columnName));
    }

    @Override
    public List<T> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    @Override
    public List<T> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    /** 空值统一返回空列表，与 JSONB 列 DEFAULT '[]' 保持一致 */
    private List<T> parse(String json) throws SQLException {
        if (json == null) {
            return List.of();
        }
        try {
            return MAPPER.readValue(json, typeRef());
        } catch (JacksonException e) {
            throw new SQLException("JSON 反序列化失败", e);
        }
    }
}
