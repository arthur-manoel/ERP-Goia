"use client"
import { forwardRef } from "react"
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox"

export type Option = { value: string; label: string; disabled?: boolean }
type Props = {
  options: Option[]
  value: string
  onValueChange: (value: string) => void
  id?: string
  label?: string
  invalid?: boolean
  describedBy?: string
  onBlur?: () => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

export const SearchSelect = forwardRef<HTMLInputElement, Props>(
  function SearchSelect(
    {
      options,
      value,
      onValueChange,
      id,
      label,
      invalid,
      describedBy,
      onBlur,
      disabled,
      placeholder = "Digite para buscar...",
      className,
    },
    ref,
  ) {
    return (
      <Combobox
        modal={false}
        items={options}
        value={options.find((option) => option.value === value) ?? null}
        onValueChange={(option) => onValueChange(option?.value ?? "")}
        isItemEqualToValue={(a, b) => a.value === b.value}
        disabled={disabled}
      >
        <ComboboxInput
          ref={ref}
          id={id}
          aria-label={label}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onBlur={onBlur}
          placeholder={placeholder}
          className={className ?? "w-full"}
          disabled={disabled}
        />
        <ComboboxContent className="pointer-events-auto">
          <ComboboxEmpty>
            {options.length
              ? "Nenhuma opção encontrada."
              : "Nenhum cadastro disponível."}
          </ComboboxEmpty>
          <ComboboxList>
            {(option: Option) => (
              <ComboboxItem
                key={option.value}
                value={option}
                disabled={option.disabled}
              >
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
  },
)
