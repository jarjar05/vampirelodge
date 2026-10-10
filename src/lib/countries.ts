export type Country = {
  /** ISO 3166-1 alpha-2 code, used as the option key because several countries share a dial code. */
  code: string;
  name: string;
  dialCode: string;
};

function country(code: string, name: string, dialCode: string): Country {
  return { code, name, dialCode };
}

// Alphabetical by name. Covers the most common countries rather than every territory.
export const countries: Country[] = [
  country("AF", "Afghanistan", "93"), country("AL", "Albania", "355"), country("DZ", "Algeria", "213"),
  country("AR", "Argentina", "54"), country("AM", "Armenia", "374"), country("AU", "Australia", "61"),
  country("AT", "Austria", "43"), country("AZ", "Azerbaijan", "994"), country("BH", "Bahrain", "973"),
  country("BD", "Bangladesh", "880"), country("BY", "Belarus", "375"), country("BE", "Belgium", "32"),
  country("BT", "Bhutan", "975"), country("BO", "Bolivia", "591"), country("BA", "Bosnia and Herzegovina", "387"),
  country("BR", "Brazil", "55"), country("BN", "Brunei", "673"), country("BG", "Bulgaria", "359"),
  country("KH", "Cambodia", "855"), country("CM", "Cameroon", "237"), country("CA", "Canada", "1"),
  country("CL", "Chile", "56"), country("CN", "China", "86"), country("CO", "Colombia", "57"),
  country("CR", "Costa Rica", "506"), country("HR", "Croatia", "385"), country("CY", "Cyprus", "357"),
  country("CZ", "Czechia", "420"), country("DK", "Denmark", "45"), country("DO", "Dominican Republic", "1"),
  country("EC", "Ecuador", "593"), country("EG", "Egypt", "20"), country("EE", "Estonia", "372"),
  country("ET", "Ethiopia", "251"), country("FJ", "Fiji", "679"), country("FI", "Finland", "358"),
  country("FR", "France", "33"), country("GE", "Georgia", "995"), country("DE", "Germany", "49"),
  country("GH", "Ghana", "233"), country("GR", "Greece", "30"), country("GT", "Guatemala", "502"),
  country("HK", "Hong Kong", "852"), country("HU", "Hungary", "36"), country("IS", "Iceland", "354"),
  country("IN", "India", "91"), country("ID", "Indonesia", "62"), country("IR", "Iran", "98"),
  country("IQ", "Iraq", "964"), country("IE", "Ireland", "353"), country("IL", "Israel", "972"),
  country("IT", "Italy", "39"), country("JM", "Jamaica", "1"), country("JP", "Japan", "81"),
  country("JO", "Jordan", "962"), country("KZ", "Kazakhstan", "7"), country("KE", "Kenya", "254"),
  country("KW", "Kuwait", "965"), country("KG", "Kyrgyzstan", "996"), country("LA", "Laos", "856"),
  country("LV", "Latvia", "371"), country("LB", "Lebanon", "961"), country("LT", "Lithuania", "370"),
  country("LU", "Luxembourg", "352"), country("MO", "Macau", "853"), country("MY", "Malaysia", "60"),
  country("MV", "Maldives", "960"), country("MT", "Malta", "356"), country("MU", "Mauritius", "230"),
  country("MX", "Mexico", "52"), country("MN", "Mongolia", "976"), country("MA", "Morocco", "212"),
  country("MM", "Myanmar", "95"), country("NP", "Nepal", "977"), country("NL", "Netherlands", "31"),
  country("NZ", "New Zealand", "64"), country("NG", "Nigeria", "234"), country("NO", "Norway", "47"),
  country("OM", "Oman", "968"), country("PK", "Pakistan", "92"), country("PA", "Panama", "507"),
  country("PG", "Papua New Guinea", "675"), country("PY", "Paraguay", "595"), country("PE", "Peru", "51"),
  country("PH", "Philippines", "63"), country("PL", "Poland", "48"), country("PT", "Portugal", "351"),
  country("QA", "Qatar", "974"), country("RO", "Romania", "40"), country("RU", "Russia", "7"),
  country("SA", "Saudi Arabia", "966"), country("RS", "Serbia", "381"), country("SG", "Singapore", "65"),
  country("SK", "Slovakia", "421"), country("SI", "Slovenia", "386"), country("ZA", "South Africa", "27"),
  country("KR", "South Korea", "82"), country("ES", "Spain", "34"), country("LK", "Sri Lanka", "94"),
  country("SE", "Sweden", "46"), country("CH", "Switzerland", "41"), country("TW", "Taiwan", "886"),
  country("TZ", "Tanzania", "255"), country("TH", "Thailand", "66"), country("TL", "Timor-Leste", "670"),
  country("TN", "Tunisia", "216"), country("TR", "Turkey", "90"), country("UG", "Uganda", "256"),
  country("UA", "Ukraine", "380"), country("AE", "United Arab Emirates", "971"), country("GB", "United Kingdom", "44"),
  country("US", "United States", "1"), country("UY", "Uruguay", "598"), country("UZ", "Uzbekistan", "998"),
  country("VE", "Venezuela", "58"), country("VN", "Vietnam", "84"), country("ZM", "Zambia", "260"),
  country("ZW", "Zimbabwe", "263"),
];

const fallbackCountryCode = "SG";
// When a dial code is shared, these are the countries a bare number most likely belongs to.
const preferredForSharedDialCode = new Set(["US", "RU"]);

function findCountry(code: string) {
  return countries.find((item) => item.code === code);
}

const lastCountryStorageKey = "phoneCountry";

/** The country to preselect: the one last picked in this browser, otherwise Singapore. */
export function defaultCountry(): Country {
  let lastUsed: string | null = null;
  try {
    lastUsed = window.localStorage.getItem(lastCountryStorageKey);
  } catch {
    // Storage can be unavailable (private mode); fall back to the default.
  }
  return (lastUsed && findCountry(lastUsed)) || findCountry(fallbackCountryCode)!;
}

export function rememberCountry(selected: Country) {
  try {
    window.localStorage.setItem(lastCountryStorageKey, selected.code);
  } catch {
    // Not being able to remember the choice is harmless.
  }
}

/** Split a stored international number such as "+6591234567" into its country and national number. */
export function splitPhoneNumber(phone: string | null | undefined): { country: Country; nationalNumber: string } {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!phone?.trim().startsWith("+") || !digits) return { country: defaultCountry(), nationalNumber: digits };

  const matches = countries.filter((item) => digits.startsWith(item.dialCode));
  if (matches.length === 0) return { country: defaultCountry(), nationalNumber: digits };
  const longest = Math.max(...matches.map((item) => item.dialCode.length));
  const candidates = matches.filter((item) => item.dialCode.length === longest);
  const match = candidates.find((item) => preferredForSharedDialCode.has(item.code)) ?? candidates[0];
  return { country: match, nationalNumber: digits.slice(match.dialCode.length) };
}

/** Build the international number the backend stores, or "" when no number was entered. */
export function joinPhoneNumber(selected: Country, nationalNumber: string) {
  let digits = nationalNumber.replace(/\D/g, "");
  // People often type the domestic trunk "0" (e.g. 07911 123456), which is dropped after a country code.
  // Italy is the exception: its numbers keep the leading zero.
  if (selected.code !== "IT") digits = digits.replace(/^0+/, "");
  return digits ? `+${selected.dialCode}${digits}` : "";
}
