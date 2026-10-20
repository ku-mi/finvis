// Human-readable names for Finantly's built-in categories.
// Finantly exports default categories without names (only emoji), so names are
// resolved by emoji. Custom categories/subcategories keep the name from the export.
// Edit freely — this is the single place to rename things.

export type SpendGroup = "fixed" | "essentials" | "lifestyle" | "business";

/** Category name keyed by the emoji of its FIRST subcategory (stable in Finantly defaults). */
export const CATEGORY_BY_FIRST_EMOJI: Record<string, string> = {
  "📈": "Investments",
  "✈️": "Travel",
  "🎓": "Education",
  "🛍️": "Other income",
  "🛒": "Food & Drinks",
  "🎬": "Entertainment",
  "👴": "Benefits",
  "👕": "Clothing",
  "💰": "Salary & B2B",
  "🏠": "Housing",
  "⛽": "Transport",
  "💊": "Health & Sport",
  "🎁": "Gifts & Misc",
  "🛠️": "Side business",
  "🚗": "Insurance & ZUS",
};

/** Subcategory name keyed by emoji (used when the export has no name). */
export const SUBCATEGORY_BY_EMOJI: Record<string, string> = {
  "📈": "Stocks", "🏦": "Interest", "💹": "Dividends",
  "✈️": "Flights", "🏨": "Accommodation", "🏝️": "On holiday",
  "🎓": "Courses", "📚": "Materials", "🏫": "Tuition",
  "🛍️": "Sales", "🧾": "Refunds", "🎁": "Gifts",
  "🛒": "Groceries", "🍽️": "Restaurants", "☕": "Coffee",
  "🎬": "Movies & streaming", "🎮": "Games", "🎨": "Hobbies",
  "👴": "Pension", "📜": "Grants", "👨‍👩‍👧‍👦": "Family support",
  "👕": "Clothes", "👟": "Shoes", "👜": "Accessories",
  "💰": "Salary / invoices", "⏰": "Overtime",
  "🏠": "Mortgage", "💡": "Electricity", "🔥": "Heating", "💧": "Water", "📺": "Internet & TV", "🛋️": "Furnishing",
  "⛽": "Fuel", "🚌": "Parking & transit", "🚕": "Taxi", "🔧": "Car service", "📑": "Car insurance",
  "💊": "Pharmacy", "🩺": "Doctors & therapy", "🏥": "Clinic",
  "💳": "Bank fees", "🤝": "Donations",
  "🛠️": "Services", "💻": "Freelance", "💸": "Side income",
  "🚗": "Car", "🏘️": "Property", "❤️": "Social insurance",
};

/** Name for transactions that have a category but no subcategory, keyed by category name. */
export const GENERAL_SUBCATEGORY: Record<string, string> = {
  Company: "Taxes & VAT",
  "Gifts & Misc": "Unspecified",
};

/** Group used for the "Fixed / Essentials / Lifestyle / Business" angle. Keyed by category name. */
export const GROUP_BY_CATEGORY: Record<string, SpendGroup> = {
  Housing: "fixed",
  "Insurance & ZUS": "fixed",
  Company: "business",
  "Food & Drinks": "essentials",
  "Health & Sport": "essentials",
  Transport: "essentials",
  Education: "essentials",
  Entertainment: "lifestyle",
  Travel: "lifestyle",
  Clothing: "lifestyle",
  "Self Care": "lifestyle",
  "Gifts & Misc": "lifestyle",
};

/** Subcategory-level overrides of the group (keyed by subcategory name). */
export const GROUP_BY_SUBCATEGORY: Record<string, SpendGroup> = {
  Restaurants: "lifestyle",
  Coffee: "lifestyle",
  Sport: "lifestyle",
  "Bank fees": "fixed",
};

export const GROUP_LABEL: Record<SpendGroup, string> = {
  fixed: "Fixed & obligations",
  essentials: "Essentials",
  lifestyle: "Lifestyle",
  business: "Business costs",
};

/**
 * Extra categorisation rules for transactions left uncategorised in the export.
 * Applied after Finantly's own `suggestions`. `test` runs on the raw description.
 */
export const EXTRA_RULES: {
  test: RegExp;
  sign: "income" | "expense";
  category: string;
  subcategory?: string;
}[] = [
  // Monthly B2B invoice payments ("1/09/2026", "/VAT/.../INV/1/04/2025/...")
  { test: /(^|\/INV\/|\/TXT\/)1\/\d{2}\/\d{4}/, sign: "income", category: "Salary & B2B", subcategory: "Salary / invoices" },
  // Tax office transfers (VAT-7, PIT)
  { test: /\/TI\/|VAT-7|PIT-?\d/i, sign: "expense", category: "Company", subcategory: "Taxes" },
];
