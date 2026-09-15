import { useEffect, useState } from "react"
import { Lightbulb } from "lucide-react"

import { notify } from "@shop/app-kit"
import { ProductsAdminApi } from "@shop/api/sdk"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
} from "@shop/ui-web"

import type { ProductTitleTarget } from "./table"

const NAME_MAX = 30
const SUBTITLE_MIN = 10
const SUBTITLE_MAX = 30

/**
 * 编辑标题 弹窗：改「商品标题 + 导购标题（卖点）」两项。
 *
 * - 数据直接来自列表行（列表行已含 name/subtitle），无需再拉详情；
 * - 后端约束：name ≤ 30 字；subtitle 留空或 10~30 字（见 UpdateProductRequest）；
 * - 提交走 updateProduct（PATCH：传空串 subtitle 即「清空卖点」，name 必填）。
 * - 生命周期：受控（open/product 由外层持有），onSaved 用于保存后让外层失效列表。
 * - props 只收预填切片（id/name/subtitle），不背整行商品。
 */
export function EditTitleDialog({
    open,
    product,
    onOpenChange,
    onSaved,
}: {
    open: boolean
    product?: ProductTitleTarget
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}) {
    const [name, setName] = useState("")
    const [subtitle, setSubtitle] = useState("")
    const [error, setError] = useState<string>()
    // 共享错误文案对应的出错字段：aria-describedby 与提交失败聚焦都靠它定位
    const [errorField, setErrorField] = useState<"name" | "subtitle">()
    const [submitting, setSubmitting] = useState(false)

    // 打开时预填当前值（subtitle 为 null 视作空卖点）
    useEffect(() => {
        if (open && product) {
            setName(product.name)
            setSubtitle(product.subtitle ?? "")
            setError(undefined)
            setErrorField(undefined)
        }
    }, [open, product])

    const submit = async () => {
        if (!product) return
        const trimmedName = name.trim()
        const trimmedSub = subtitle.trim()
        // 校验失败：记录出错字段，aria-describedby 与提交失败聚焦都靠它定位
        const fail = (message: string, field: "name" | "subtitle") => {
            setError(message)
            setErrorField(field)
            document.getElementById(`edit-title-${field}`)?.focus()
            return
        }
        if (!trimmedName) return fail("请填写商品标题", "name")
        if (trimmedName.length > NAME_MAX) return fail(`商品标题最长 ${NAME_MAX} 字`, "name")
        if (trimmedSub && (trimmedSub.length < SUBTITLE_MIN || trimmedSub.length > SUBTITLE_MAX)) {
            return fail(`导购标题需为 ${SUBTITLE_MIN}~${SUBTITLE_MAX} 个字，或留空`, "subtitle")
        }
        setSubmitting(true)
        try {
            await ProductsAdminApi.updateProduct({
                path: { id: product.id },
                body: { name: trimmedName, subtitle: trimmedSub },
            })
            notify.success("标题已更新")
            onSaved()
            onOpenChange(false)
        } catch (error) {
            notify.fromError(error, "保存失败")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>编辑标题</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* 商品标题：必填 */}
                    <div className="space-y-2">
                        <label
                            htmlFor="edit-title-name"
                            className="text-sm font-medium"
                        >
                            <span className="text-destructive">*</span> 商品标题
                        </label>
                        <Input
                            id="edit-title-name"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value)
                                if (error) {
                                    setError(undefined)
                                    setErrorField(undefined)
                                }
                            }}
                            maxLength={NAME_MAX}
                            placeholder="请输入商品标题"
                            className="tabular-nums"
                            aria-invalid={errorField === "name"}
                            aria-describedby={
                                errorField === "name" ? "edit-title-error" : undefined
                            }
                        />
                        <div className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
                            {name.length}/{NAME_MAX}
                        </div>
                    </div>

                    {/* 导购标题（卖点）：选填，标题结构提示 */}
                    <div className="space-y-2">
                        <label
                            htmlFor="edit-title-subtitle"
                            className="text-sm font-medium"
                        >
                            导购标题
                        </label>
                        <p className="text-xs text-muted-foreground">
                            <Lightbulb className="mr-1 inline size-3.5 text-warning" />
                            标题结构推荐：品牌 + 品类词 + 利益点
                        </p>
                        <Input
                            id="edit-title-subtitle"
                            value={subtitle}
                            onChange={(e) => {
                                setSubtitle(e.target.value)
                                if (error) {
                                    setError(undefined)
                                    setErrorField(undefined)
                                }
                            }}
                            maxLength={SUBTITLE_MAX}
                            placeholder={`选填，${SUBTITLE_MIN}~${SUBTITLE_MAX} 字，留空即不展示卖点`}
                            aria-invalid={errorField === "subtitle"}
                            aria-describedby={
                                errorField === "subtitle" ? "edit-title-error" : undefined
                            }
                        />
                        <div className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
                            {subtitle.length}/{SUBTITLE_MAX}
                        </div>
                    </div>

                    {error && (
                        <p
                            id="edit-title-error"
                            role="alert"
                            className="text-sm text-destructive"
                        >
                            {error}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="secondary"
                        onClick={() => onOpenChange(false)}
                        disabled={submitting}
                    >
                        取消
                    </Button>
                    <Button
                        onClick={() => void submit()}
                        disabled={submitting}
                    >
                        {submitting ? "提交中…" : "提交"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
