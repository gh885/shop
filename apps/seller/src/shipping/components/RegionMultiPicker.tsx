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

export function RegionMultiPicker({
    value,
    onChange,
    placeholder,
    ariaLabel,
}: {
    value: string[]
    onChange: (value: string[]) => void
    // 不给时回退 catalog 那句：默认值不能是中文硬编码（i18n）
    placeholder?: string
    // 触发器显示的是会变的已选值，读屏念不出字段名：ariaLabel 必由调用方传，别当冗余删
    ariaLabel: string
}) {
    const t = useT()
    // throwOnError 留 false：区划树拉挂只退化成空选择，不把运费模板页换成错误页
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
                aria-label={ariaLabel}
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
                    placeholder={placeholder ?? t("shipping.regionPicker.placeholder")}
                />
            </CascaderTrigger>

            <CascaderContent className="w-96">
                <CascaderPanel>
                    <CascaderNav>
                        {/* tree 模式不会下钻，没有「返回上一层」 */}
                        <CascaderInput
                            showBack={false}
                            placeholder={t("shipping.regionPicker.searchPlaceholder")}
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
                {t("shipping.regionPicker.selectedCount", { count: selected.length })}
            </span>
        </span>
    )
}
