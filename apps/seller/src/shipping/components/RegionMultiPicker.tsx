import { useQuery } from "@tanstack/react-query"
import { useT } from "#/locales/use-t"
import { MapPin } from "lucide-react"

import { regionCascaderTreeOptions } from "@shop/app-kit/forms"
import {
    Button,
    Cascader,
    CascaderContent,
    CascaderEmpty,
    CascaderInput,
    CascaderItems,
    CascaderList,
    CascaderNav,
    CascaderPanel,
    CascaderStatus,
    CascaderTrigger,
    useCascaderSelection,
} from "@shop/ui-web"

/**
 * 运费模板的地区多选（reui Cascader 的 tree 模式 + 本项目区划整树）。
 *
 * 为什么是 tree：地区规则要能同时看到整棵树、一层层勾；tree 是 reui 三个模式里唯一让
 * 「父节点半选/全选」可读的——分支行的数字就是已选计数，勾父会 cascade 到底层。
 * `cascade` + `selectable="any"` 让「整个省一次选完」成立。
 *
 * 数据源：国标区划整树（@shop/common regions），已按同一套规则归一——直筒子市合成 6 位叶子、
 * 9 位街道码不进树，所以这里出现的都是 6 位码，与 regionCode 契约一致。
 * 「更具体的地区规则优先命中」由运费模型层负责，本组件只管选哪几个。
 *
 * 对外契约不变：value 是一组 6 位码，与运费表单的 regionPrefixes / 不配送前缀一致。
 */
export function RegionMultiPicker({
    value,
    onChange,
    placeholder,
}: {
    value: string[]
    onChange: (value: string[]) => void
    /** 空态回显那句。不给时用 catalog 的「请选择地区」——默认值不能是中文硬编码（i18n §4.2） */
    placeholder?: string
}) {
    const t = useT()
    // 整棵区划树随包懒加载、全会话只取一次（与地址表单共用同一 key，见 app-kit region-query）；
    // 失败退化成空选择，不把运费模板页换成错误页
    const { data: items } = useQuery({ ...regionCascaderTreeOptions, throwOnError: false })

    return (
        <Cascader
            multiple
            cascade
            selectable="any"
            mode="tree"
            items={items ?? []}
            value={value}
            onValueChange={onChange}
        >
            <CascaderTrigger
                render={
                    <Button
                        type="button"
                        variant="outline"
                        className="h-auto min-h-9 w-full justify-start text-left"
                    />
                }
            >
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <RegionMultiSummary
                    placeholder={placeholder ?? t("seller.shipping.regionPicker.placeholder")}
                />
            </CascaderTrigger>

            <CascaderContent className="w-96">
                <CascaderPanel>
                    <CascaderNav>
                        {/* tree 模式不会下钻，没有「返回上一层」 */}
                        <CascaderInput
                            showBack={false}
                            placeholder={t("seller.shipping.regionPicker.searchPlaceholder")}
                        />
                    </CascaderNav>
                    <CascaderEmpty />
                    <CascaderList>
                        <CascaderItems />
                    </CascaderList>
                    <CascaderStatus />
                </CascaderPanel>
            </CascaderContent>
        </Cascader>
    )
}

/** 触发框回显：第一个选中项的路径 + 总数；空态给占位文案。 */
function RegionMultiSummary({ placeholder }: { placeholder: string }) {
    const t = useT()
    const { isEmpty, paths, selected } = useCascaderSelection()
    const first = paths.find((path) => path.length > 0)

    if (isEmpty || !first) {
        return <span className="text-muted-foreground min-w-0 flex-1 truncate">{placeholder}</span>
    }
    return (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-start">
            <span className="min-w-0 truncate">{first.map((node) => node.label).join(" / ")}</span>
            <span className="text-muted-foreground shrink-0">
                {t("seller.shipping.regionPicker.selectedCount", { count: selected.length })}
            </span>
        </span>
    )
}
