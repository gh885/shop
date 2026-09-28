/**
 * Compliance 模块 —— 公开文本的违禁词闸门（COM-01）。
 *
 * <p>schema: compliance。一张词表（compliance.forbidden_words）加一个纯函数命中判定。
 * 本模块不碰任何业务对象：它只回答「这段文本能不能公开」，由各业务模块在自己的动作事务里
 * 经 {@link com.shop.platform.compliance.api.ForbiddenWordCommand} 同步调用（同事务原子：
 * 文本带违禁词则该次写入一起回滚，不存在「商品已上架但内容没过闸」）。
 *
 * <p>先做商品标题与卖点（发布/再上架与已建档后的编辑），评价与售后凭证文本复用同一条出口（P2 接线）。
 * 图文详情不在这一步：那一列存的是图片 key，没有可读判的自由文本。
 * 判定口径（大小写、全半角归一）收在本模块的纯函数里，词表只负责「有哪些词」——
 * 将来加正则/豁免规则是加列，不是改口径。
 */
@ApplicationModule(displayName = "Compliance")
package com.shop.platform.compliance;

import org.springframework.modulith.ApplicationModule;
