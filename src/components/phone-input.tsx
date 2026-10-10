import { useState } from "react";
import { countries, joinPhoneNumber, rememberCountry, splitPhoneNumber } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * A phone field with the country code picked from a list, so the user only types the local number.
 * `onChange` receives the full international number (e.g. "+6591234567"), or "" when empty.
 */
export function PhoneInput({
  id,
  defaultValue,
  onChange,
  required = false,
  autoFocus = false,
  autoComplete = "tel-national",
  className,
}: {
  id: string;
  /** Initial value in international format; later changes to this prop are ignored. */
  defaultValue?: string | null;
  onChange: (phone: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  /** Classes shared by the country select and the number input, so it matches the form it sits in. */
  className?: string;
}) {
  const [initial] = useState(() => splitPhoneNumber(defaultValue));
  const [selectedCountry, setSelectedCountry] = useState(initial.country);
  const [nationalNumber, setNationalNumber] = useState(initial.nationalNumber);

  return (
    <span className="flex gap-2">
      <select
        aria-label="Country code"
        autoComplete="tel-country-code"
        value={selectedCountry.code}
        onChange={(event) => {
          const next = countries.find((item) => item.code === event.target.value) ?? selectedCountry;
          setSelectedCountry(next);
          rememberCountry(next);
          onChange(joinPhoneNumber(next, nationalNumber));
        }}
        className={cn(className, "w-[7.25rem] shrink-0 px-2")}
      >
        {countries.map((item) => <option key={item.code} value={item.code}>+{item.dialCode} {item.name}</option>)}
      </select>
      <input
        id={id}
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        placeholder="Phone number"
        required={required}
        autoFocus={autoFocus}
        maxLength={20}
        value={nationalNumber}
        onChange={(event) => {
          // Digits and common separators only; a typed "+" is not needed because the code comes from the list.
          const next = event.target.value.replace(/[^\d\s().-]/g, "");
          setNationalNumber(next);
          onChange(joinPhoneNumber(selectedCountry, next));
        }}
        className={cn(className, "min-w-0 flex-1")}
      />
    </span>
  );
}
