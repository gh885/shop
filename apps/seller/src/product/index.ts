/**
 * products —— 卖家商品域文件夹（扁形态，同 apps/web/src/cart）：
 * - edit-rules.ts   ：商品状态 × 编辑会话能力规则表（后端状态机的声明式镜像）
 * - draft-model.ts ：发布草稿的领域模型（类型 + 纯规则 + 投影，不碰 React/网络）
 * - data.ts        ：数据层（SDK 封装 + 图片直传）
 * - queries.ts     ：TanStack Query 定义层（key 工厂 + queryOptions + 类目树 hooks）；类目树的纯算法在 @shop/common/category
 * - Category*.tsx   ：发布第一步「选类目」的组件（页签 / 搜索 / 级联三列）
 * - Publish*.tsx    ：发布第二步「填商品信息」的组屏（锚点页签 / 分区卡片 / 底部操作条）
 *
 * 桶文件只暴露外部真正消费的那几个；域内一律相对路径直连，不走这里。
 */

export { CategoryStep } from "./create/category/CategoryStep"
export {
    BasicStep as PublishBasicStep,
    type BasicStepValues,
    type SubmitMode,
} from "./create/basic/BasicStep"
