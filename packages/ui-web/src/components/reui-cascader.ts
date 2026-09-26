/**
 * reui Cascader 对外出口（vendored 组件，见 ./reui/README.md）。
 *
 * 刻意只导出「拼装一个级联选择器」用得到的积木，不整包 re-export：业务组件
 * （RegionPicker / 运费模板的多选）经这里取件，vendored 目录本身不直接被 app import。
 * 归一（直筒子市合成 6 位叶子）与数据源在 @shop/common 的 regions，不在本文件。
 */
export {
    Cascader,
    CascaderTrigger,
    CascaderContent,
    CascaderPanel,
    CascaderList,
    CascaderEmpty,
    CascaderStatus,
    useCascaderSelection,
} from "./reui/cascader/cascader"
export { CascaderColumns } from "./reui/cascader/cascader-columns"
export { CascaderInput, CascaderNav, CascaderBreadcrumb } from "./reui/cascader/cascader-nav"
export { CascaderItems } from "./reui/cascader/cascader-item"
export type { CascaderNode } from "./reui/cascader/cascader-types"
export type {
    CascaderProps,
    CascaderSingleProps,
    CascaderMultipleProps,
    CascaderBaseProps,
} from "./reui/cascader/cascader"
export type { CascaderSelection } from "./reui/cascader/cascader"
