import LegacyFieldInput from "./LegacyFieldInput";
import type { ExtractedField } from "../types/document";

type Width = "short" | "medium" | "long";

// Same field order as the legacy application's own row grouping (see
// reference screenshots) - flattened into one list so a responsive grid
// (see .legacy-form-grid) can reflow it to however many columns
// actually fit. Width is based on the field's typical VALUE length, not
// its label - a short code like SEX or ZIP never needs as much room as
// an address or a name, and giving every field the same width either
// wastes space on short values or truncates long ones.
const FIELDS: Array<[string, Width]> = [
  ["image_name", "medium"],
  ["record_no", "short"],
  ["customer_name", "long"],
  ["email_address", "medium"],
  ["res_address", "long"],
  ["city_1", "medium"],
  ["state_1", "short"],
  ["zip_1", "short"],
  ["phno_1", "medium"],
  ["country_1", "short"],
  ["sex_1", "short"],
  ["d_birth", "medium"],
  ["height", "short"],
  ["weight", "short"],
  ["blood_group", "short"],
  ["billing_name", "long"],
  ["shipper_name", "long"],
  ["city_2", "medium"],
  ["state_2", "short"],
  ["zip_2", "short"],
  ["country_2", "short"],
  ["phno_2", "medium"],
  ["alcoholic", "short"],
  ["smoker", "short"],
  ["past_surg", "short"],
  ["diabetic", "short"],
  ["allergies", "medium"],
  ["policy_no", "medium"],
  ["d_b_life_assure", "medium"],
  ["p_inst", "medium"],
  ["name_p_holder", "medium"],
  ["stm_name", "medium"],
  ["stm_code", "medium"],
  ["dob", "medium"],
  ["sex_2", "short"],
  ["card_name", "medium"],
  ["medicine", "medium"],
  ["dosage", "short"],
  ["tablets", "short"],
  ["pill_rate", "medium"],
  ["cost", "medium"],
  ["shipping_cost", "medium"],
  ["total_amount", "medium"],
  ["remark", "long"],
];

interface Props {
  fields: Record<string, ExtractedField>;
  selectedField: string | null;
  hasDocument?: boolean;
  onSelectField: (fieldName: string) => void;
  onChangeField: (fieldName: string, value: string) => void;
  onToggleInvalidField: (fieldName: string) => void;
}

export default function LegacyForm({
  fields,
  selectedField,
  hasDocument = true,
  onSelectField,
  onChangeField,
  onToggleInvalidField,
}: Props) {
  return (
    <div className="legacy-form-grid">
      {FIELDS.map(([name, width]) => {
        const field = fields[name];
        if (!field) return null;
        return (
          <LegacyFieldInput
            key={name}
            field={field}
            width={width}
            hasDocument={hasDocument}
            selected={name === selectedField}
            onSelect={() => onSelectField(name)}
            onChange={(value) => onChangeField(name, value)}
            onToggleInvalid={() => onToggleInvalidField(name)}
          />
        );
      })}
    </div>
  );
}
