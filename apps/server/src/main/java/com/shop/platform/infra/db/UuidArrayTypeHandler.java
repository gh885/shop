package com.shop.platform.infra.db;

import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

/**
 * {@code uuid[]} 数组列 ↔ {@code List<UUID>}。
 *
 * <p>null 与空数组语义不同（promotion 的 category_ids：null = 全类目，{} = 一个类目都不匹配），
 * 两个方向都原样保留这个区别，不做归一化。写方向当前只用文本字面量 + {@code CAST}（见各 mapper），
 * 这里补全双向，读方向供构造映射用。
 */
public class UuidArrayTypeHandler extends BaseTypeHandler<List<UUID>> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<UUID> parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setArray(i, ps.getConnection().createArrayOf("uuid", parameter.toArray(UUID[]::new)));
    }

    @Override
    public List<UUID> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getArray(columnName));
    }

    @Override
    public List<UUID> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getArray(columnIndex));
    }

    @Override
    public List<UUID> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getArray(columnIndex));
    }

    private List<UUID> parse(Array array) throws SQLException {
        if (array == null) {
            return null;
        }
        UUID[] values = (UUID[]) array.getArray();
        return values == null ? List.of() : List.copyOf(Arrays.asList(values));
    }
}
