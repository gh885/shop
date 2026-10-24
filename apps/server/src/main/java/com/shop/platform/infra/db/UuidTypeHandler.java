package com.shop.platform.infra.db;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

/**
 * UUID 与 PG {@code uuid} 列的双向映射。
 *
 * <p>MyBatis 内建不认 UUID，不注册的话 BaseMapper 生成的参数映射在运行期直接
 * {@code Type handler was null}。写方向交给驱动 {@code setObject}（PG 驱动原生认 UUID），
 * 读方向走字符串再解析——不绑驱动返回类型，出错也是解析错误而不是静默类型漂移。
 */
public class UuidTypeHandler extends BaseTypeHandler<UUID> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, UUID parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setObject(i, parameter);
    }

    @Override
    public UUID getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getString(columnName));
    }

    @Override
    public UUID getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    @Override
    public UUID getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    private UUID parse(String raw) {
        return raw == null ? null : UUID.fromString(raw);
    }
}
