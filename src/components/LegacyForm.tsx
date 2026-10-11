import LegacyFieldInput from "./LegacyFieldInput";
import type { ExtractedField } from "../types/document";

type Width = "xs" | "sm" | "md" | "lg";

// Mirrors the legacy application's exact row grouping (see reference
// screenshots) - each inner array is one visual row of the form.
const ROWS: Array<Array<[string, Width]>> = [
  [["image_name", "md"], ["record_no", "sm"], ["customer_name", "lg"], ["email_address", "md"]],
  [["res_address", "lg"], ["city_1", "sm"], ["state_1", "xs"], ["zip_1", "sm"]],
  [
    ["phno_1", "sm"],
    ["country_1", "xs"],
    ["sex_1", "xs"],
    ["d_birth", "sm"],
    ["height", "xs"],
    ["weight", "xs"],
    ["blood_group", "xs"],
  ],
  [["billing_name", "md"], ["shipper_name", "md"], ["city_2", "sm"], ["state_2", "xs"]],
  [
    ["zip_2", "sm"],
    ["country_2", "xs"],
    ["phno_2", "sm"],
    ["alcoholic", "xs"],
    ["smoker", "xs"],
    ["past_surg", "xs"],
    ["diabetic", "xs"],
  ],
  [["allergies", "md"], ["policy_no", "sm"], ["d_b_life_assure", "sm"], ["p_inst", "sm"], ["name_p_holder", "md"]],
  [["stm_name", "md"], ["stm_code", "sm"], ["dob", "sm"], ["sex_2", "xs"], ["card_name", "md"]],
  [["medicine", "sm"], ["dosage", "sm"], ["tablets", "xs"], ["pill_rate", "sm"], ["cost", "sm"], ["shipping_cost", "sm"]],
  [["total_amount", "sm"], ["remark", "lg"]],
];

interface Props {
  fields: Record<string, ExtractedField>;
  selectedField: string | null;
  hasDocument?: boolean;
  onSelectField: (fieldName: string) => void;
  onChangeField: (fieldName: string, value: string) => void;
}

export default function LegacyForm({
  fields,
  selectedField,
  hasDocument = true,
  onSelectField,
  onChangeField,
}: Props) {
  return (
    <div className="legacy-form">
      {ROWS.map((row, i) => (
        <div className="legacy-form-row" key={i}>
          {row.map(([name, width]) => {
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
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
