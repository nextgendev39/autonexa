"use client";

import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { countryFlag } from "@/lib/vehicles/countries";
import {
  defaultPhoneCountry,
  detectPhoneCountry,
  nationalFromInternational,
  normalizeInternationalPhone,
  phoneCountryByCode,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from "@/lib/utils/phone";

export function PhoneInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
  defaultCountryCode = "AE",
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** ISO country used when the value is empty. */
  defaultCountryCode?: string;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [emptyCountry, setEmptyCountry] = useState<PhoneCountry>(() =>
    phoneCountryByCode(defaultCountryCode),
  );
  const country = value ? detectPhoneCountry(value) : emptyCountry;

  const national = useMemo(
    () => (value ? nationalFromInternational(value, country) : ""),
    [value, country],
  );

  function emitNational(nextNational: string, nextCountry: PhoneCountry = country) {
    const digits = nextNational.replace(/\D/g, "");
    if (!digits) {
      onChange("");
      return;
    }
    const normalized = normalizeInternationalPhone(digits, nextCountry);
    onChange(normalized ?? `${nextCountry.dialCode}${digits}`);
  }

  function selectCountry(next: PhoneCountry) {
    setEmptyCountry(next);
    setOpen(false);
    emitNational(national, next);
  }

  return (
    <div className="flex min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              aria-label={t("phoneCountry")}
              className={cn(
                "border-input bg-muted text-foreground h-11 shrink-0 gap-1.5 rounded-e-none rounded-s-lg border-e-0 px-2.5 font-normal tabular-nums md:h-10",
              )}
            />
          }
        >
          <span className="text-base leading-none" aria-hidden>
            {countryFlag(country.code)}
          </span>
          <span className="text-muted-foreground text-sm">{country.dialCode}</span>
          <ChevronDownIcon className="text-muted-foreground size-3.5 opacity-70" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder={t("searchCountry")} />
            <CommandList>
              <CommandEmpty>{t("noCountry")}</CommandEmpty>
              <CommandGroup>
                {PHONE_COUNTRIES.map((option) => (
                  <CommandItem
                    key={`${option.code}-${option.dialCode}`}
                    value={`${option.name} ${option.dialCode} ${option.code}`}
                    data-checked={option.code === country.code || undefined}
                    onSelect={() => selectCountry(option)}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {countryFlag(option.code)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    <span className="text-muted-foreground tabular-nums">{option.dialCode}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        name={name}
        inputMode="tel"
        autoComplete="tel-national"
        disabled={disabled}
        value={national}
        placeholder={country.code === "AE" ? "50 123 4567" : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn("h-11 min-w-0 flex-1 rounded-s-none md:h-10")}
        onBlur={onBlur}
        onChange={(event) => emitNational(event.target.value)}
      />
    </div>
  );
}

export { defaultPhoneCountry };
