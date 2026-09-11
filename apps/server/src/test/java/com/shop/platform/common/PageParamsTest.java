package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** 分页参数默认值契约：null 回落 page=1/size=10，两者互相独立。全站列表接口共用。 */
class PageParamsTest {

    @Test
    void 空参数_回落首页十条() {
        PageParams params = new PageParams(null, null);

        assertThat(params.page()).isEqualTo(1);
        assertThat(params.size()).isEqualTo(10);
    }

    @Test
    void 只缺一个_另一个原样保留() {
        // 两个字段各自兜底，不共享一个「任一为空就整体回落」的开关
        assertThat(new PageParams(2, null).page()).isEqualTo(2);
        assertThat(new PageParams(2, null).size()).isEqualTo(10);
        assertThat(new PageParams(null, 20).page()).isEqualTo(1);
        assertThat(new PageParams(null, 20).size()).isEqualTo(20);
    }

    @Test
    void 显式参数_原样保留() {
        assertThat(new PageParams(3, 50).page()).isEqualTo(3);
        assertThat(new PageParams(3, 50).size()).isEqualTo(50);
    }
}
