import { useEffect, useState } from "react"
import { Lightbulb } from "lucide-react"
import { useMutation } from "@tanstack/react-query"

import { ProductsAdminApi } from "@shop/api/sdk"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Spinner,
} from "@shop/ui-web"

import type { ProductTitleTarget } from "./table"

const NAME_MAX = 30
const SUBTITLE_MIN = 10
const SUBTITLE_MAX = 30

/**
 * 编辑标题 弹窗：改「商品标题 + 导购标题（卖点）」两项。
 *
 * - 数据直接来自列表行（列表行已含 name/subtitle），无需再拉详情；
 * - 后端约束：name ≤ 30 字；subtitle 留空或 10~30 字；
 * - 提交走 updateProduct（PATCH：传空串 subtitle 即「清空卖点」，name 必填）。
 * - 生命周期：受控（open/product 由外层持有）。保存成功后调用 onSaved 通知外层「列表数据变了」，
 *   由外层（useProductList 的 handleSaved）决定失效哪个 key —— 本层不 import 任何 query key。
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
    const [submitError, setSubmitError] = useState<string>()
    // 共享错误文案对应的出错字段：aria-describedby 与提交失败聚焦都靠它定位
    const [errorField, setErrorField] = useState<"name" | "subtitle">()

    // 写通道走库 useMutation：反馈（成功/失败 toast）由全局 MutationCache 按 meta 执行，
    // 失效范围仍由外层决定（onSaved），本层不 import query key。
    const save = useMutation({
        mutationFn: (vars: { id: string; name: string; subtitle: string }) =>
            ProductsAdminApi.updateProduct({
                path: { id: vars.id },
                body: { name: vars.name, subtitle: vars.subtitle },
            }),
        meta: { success: "标题已更新", error: "保存失败" },
        onSuccess: () => {
            onSaved()
            onOpenChange(false)
        },
    })

    // 打开时预填当前值（subtitle 为 null 视作空卖点）
    // oxlint-disable react-doctor/no-adjust-state-on-prop-change -- 打开即预填编辑值是有意为之（复用组件实例，避免 key 重挂载）
    useEffect(() => {
        if (open && product) {
            // oxlint-disable-next-line react/set-state-in-effect -- 打开即预填编辑值是有意为之（复用组件实例，避免 key 重挂载）
            setName(product.name)
            setSubtitle(product.subtitle ?? "")
            setSubmitError(undefined)
            setErrorField(undefined)
        }
    }, [open, product])
    // oxlint-enable react-doctor/no-adjust-state-on-prop-change

    const submit = () => {
        if (!product) return
        const trimmedName = name.trim()
        const trimmedSub = subtitle.trim()
        // 校验失败：记录出错字段，aria-describedby 与提交失败聚焦都靠它定位
        const fail = (message: string, field: "name" | "subtitle") => {
            setSubmitError(message)
            setErrorField(field)
            document.getElementById(`edit-title-${field}`)?.focus()
            return
        }
        if (!trimmedName) return fail("请填写商品标题", "name")
        if (trimmedName.length > NAME_MAX) return fail(`商品标题最长 ${NAME_MAX} 字`, "name")
        if (trimmedSub && (trimmedSub.length < SUBTITLE_MIN || trimmedSub.length > SUBTITLE_MAX)) {
            return fail(`导购标题需为 ${SUBTITLE_MIN}~${SUBTITLE_MAX} 个字，或留空`, "subtitle")
        }
        // 服务端失败提示走全局 meta.error；这里吞掉 rejection（unhandled 会被上报）
        save.mutate(
            { id: product.id, name: trimmedName, subtitle: trimmedSub },
            { onError: () => {} },
        )
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
                        <Label
                            htmlFor="edit-title-name"
                            className="required-mark"
                        >
                            商品标题
                        </Label>
                        <Input
                            id="edit-title-name"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value)
                                if (submitError) {
                                    setSubmitError(undefined)
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
                        <Label htmlFor="edit-title-subtitle">导购标题</Label>
                        <p className="text-xs text-muted-foreground">
                            <Lightbulb className="mr-1 inline size-3.5 text-warning" />
                            标题结构推荐：品牌 + 品类词 + 利益点
                        </p>
                        <Input
                            id="edit-title-subtitle"
                            value={subtitle}
                            onChange={(e) => {
                                setSubtitle(e.target.value)
                                if (submitError) {
                                    setSubmitError(undefined)
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

                    {submitError && (
                        <p
                            id="edit-title-error"
                            role="alert"
                            className="text-sm text-destructive"
                        >
                            {submitError}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="secondary"
                        onClick={() => onOpenChange(false)}
                        disabled={save.isPending}
                    >
                        取消
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={save.isPending}
                    >
                        {save.isPending && <Spinner />}提交
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
