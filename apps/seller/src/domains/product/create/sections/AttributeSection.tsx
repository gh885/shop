import { useState } from "react"
import {
    Button,
    Field,
    FieldDescription,
    FieldLabel,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@shop/ui-web"
import { X } from "lucide-react"
import type { CategoryConfig } from "@shop/api/sdk"

import { useT } from "#/locales/use-t"
import {
    activeValues,
    plainAttributes,
    visibleAttributeIds,
    type AttributeValues,
    type FieldErrors,
} from "../model"
import type { CreateFieldErrorKey } from "../submit"

type Attr = CategoryConfig["attributes"][number]

export function AttributeSection({
    config,
    values,
    errors,
    onChange,
}: {
    config: CategoryConfig
    values: AttributeValues
    errors: FieldErrors
    onChange: (next: AttributeValues) => void
}) {
    const t = useT("product")
    const errorText = (key: string) =>
        key.startsWith("product.") ? t(key as CreateFieldErrorKey) : key
    const visible = visibleAttributeIds(config, values)
    const attributes = plainAttributes(config).filter((attribute) => visible.has(attribute.id))
    if (attributes.length === 0) return null

    function setValues(attributeId: string, next: string[]) {
        onChange({ ...values, [attributeId]: next })
    }

    return (
        <section
            id="section-attributes"
            className="scroll-mt-16 space-y-5 rounded-lg bg-background p-5 shadow-sm"
        >
            <h2 className="text-base font-semibold">{t("product.create.section.attributes")}</h2>
            {attributes.map((attribute) => (
                <AttributeField
                    key={attribute.id}
                    attribute={attribute}
                    value={values[attribute.id] ?? []}
                    error={errors[`attr:${attribute.id}`]}
                    errorText={errorText}
                    onChange={(next) => setValues(attribute.id, next)}
                />
            ))}
        </section>
    )
}

function AttributeField({
    attribute,
    value,
    error,
    errorText,
    onChange,
}: {
    attribute: Attr
    value: string[]
    error: string | undefined
    errorText: (key: string) => string
    onChange: (next: string[]) => void
}) {
    const t = useT("product")
    const [custom, setCustom] = useState("")

    const options = activeValues(attribute)
    const single = value[0] ?? ""

    return (
        <Field orientation="horizontal">
            <FieldLabel required={attribute.required}>{attribute.name}</FieldLabel>

            {attribute.valueType === "enum" ? (
                attribute.multi ? (
                    <div className="flex flex-wrap items-center gap-2">
                        {options.map((option) => {
                            const selected = value.includes(option)
                            return (
                                <Button
                                    key={option}
                                    type="button"
                                    size="sm"
                                    variant={selected ? "default" : "outline"}
                                    onClick={() =>
                                        onChange(
                                            selected
                                                ? value.filter((item) => item !== option)
                                                : [...value, option],
                                        )
                                    }
                                >
                                    {option}
                                </Button>
                            )
                        })}
                        {value
                            .filter((item) => !options.includes(item))
                            .map((item) => (
                                <span
                                    key={item}
                                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
                                >
                                    {item}
                                    <button
                                        type="button"
                                        aria-label={t("product.create.attr.removeValue", {
                                            value: item,
                                        })}
                                        onClick={() =>
                                            onChange(value.filter((entry) => entry !== item))
                                        }
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </span>
                            ))}
                        {attribute.allowCustom ? (
                            <span className="flex items-center gap-1">
                                <Input
                                    value={custom}
                                    maxLength={64}
                                    placeholder={t("product.create.attr.customPlaceholder")}
                                    onChange={(event) => setCustom(event.target.value)}
                                    className="h-9 w-36"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={custom.trim() === ""}
                                    onClick={() => {
                                        const next = custom.trim()
                                        if (next !== "" && !value.includes(next))
                                            onChange([...value, next])
                                        setCustom("")
                                    }}
                                >
                                    {t("product.create.attr.addValue")}
                                </Button>
                            </span>
                        ) : null}
                    </div>
                ) : (
                    <Select
                        items={options.map((option) => ({ value: option, label: option }))}
                        value={single}
                        onValueChange={(next) =>
                            onChange(next === null || next === "" ? [] : [next])
                        }
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder={t("product.create.attr.placeholder")} />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((option) => (
                                <SelectItem
                                    key={option}
                                    value={option}
                                >
                                    {option}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )
            ) : attribute.valueType === "bool" ? (
                <label className="flex items-center gap-2 pt-2 text-sm">
                    <input
                        type="checkbox"
                        aria-label={attribute.name}
                        checked={single === "true"}
                        onChange={(event) => onChange(event.target.checked ? ["true"] : [])}
                        className="size-4 accent-primary"
                    />
                </label>
            ) : (
                <Input
                    value={single}
                    inputMode={attribute.valueType === "number" ? "decimal" : undefined}
                    maxLength={64}
                    placeholder={
                        attribute.valueType === "number"
                            ? t("product.create.attr.numberPlaceholder")
                            : undefined
                    }
                    onChange={(event) =>
                        onChange(event.target.value.trim() === "" ? [] : [event.target.value])
                    }
                />
            )}

            {error ? (
                <p
                    role="alert"
                    className="text-sm text-destructive"
                >
                    {errorText(error)}
                </p>
            ) : attribute.unit ? (
                <FieldDescription>{attribute.unit}</FieldDescription>
            ) : null}
        </Field>
    )
}
