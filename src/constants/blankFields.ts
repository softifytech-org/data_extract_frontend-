import type { ExtractedField } from "../types/document";

// Mirrors backend/app/services/extraction/fields.py FIELD_SPECS exactly -
// (name, label, data_type). Used only to render the form in its blank,
// pre-upload state so the legacy layout is visible immediately, the same
// way the reference application always shows its form rather than a
// separate upload landing page.
const BLANK_FIELD_SPECS: Array<[string, string, ExtractedField["data_type"]]> = [
  ["image_name", "Image Name", "text"],
  ["record_no", "Record No", "id_code"],
  ["customer_name", "Customer Name", "name"],
  ["email_address", "Email Address", "email"],
  ["res_address", "Res Address", "address"],
  ["city_1", "City_1", "text"],
  ["state_1", "State_1", "enum"],
  ["zip_1", "Zip_1", "text"],
  ["phno_1", "PhNo_1", "phone"],
  ["country_1", "Country_1", "enum"],
  ["sex_1", "Sex_1", "enum"],
  ["d_birth", "D_Birth", "date"],
  ["height", "Height", "number"],
  ["weight", "Weight", "number"],
  ["blood_group", "Blood Group", "enum"],
  ["billing_name", "Billing Name", "name"],
  ["shipper_name", "Shipper Name", "name"],
  ["city_2", "City_2", "text"],
  ["state_2", "State_2", "enum"],
  ["zip_2", "Zip_2", "text"],
  ["country_2", "Country_2", "enum"],
  ["phno_2", "PHNo_2", "phone"],
  ["alcoholic", "Alcholic", "enum"],
  ["smoker", "Smoker", "enum"],
  ["past_surg", "Past Surg", "enum"],
  ["diabetic", "Diabetic", "enum"],
  ["allergies", "Allergiesd", "text"],
  ["policy_no", "Policy No", "id_code"],
  ["d_b_life_assure", "D_B_Life_Assure", "currency"],
  ["p_inst", "P_Inst", "text"],
  ["name_p_holder", "Name_P_Holder", "name"],
  ["stm_name", "STM Name", "text"],
  ["stm_code", "STM_Code", "id_code"],
  ["dob", "DOB", "date"],
  ["sex_2", "Sex_2", "enum"],
  ["card_name", "CARD Name", "enum"],
  ["medicine", "Medicine", "enum"],
  ["dosage", "Dosage", "text"],
  ["tablets", "Tablets", "number"],
  ["pill_rate", "Pill Rate", "currency"],
  ["cost", "Cost", "currency"],
  ["shipping_cost", "Shipping Cost", "currency"],
  ["total_amount", "Total Amount", "currency"],
  ["remark", "Remark", "text"],
];

export function buildBlankFields(): Record<string, ExtractedField> {
  const fields: Record<string, ExtractedField> = {};
  for (const [name, label, data_type] of BLANK_FIELD_SPECS) {
    fields[name] = {
      field_name: name,
      label,
      value: null,
      original_ocr_value: null,
      data_type,
      confidence: 0,
      status: "needs_review",
      source: "ocr",
      validation: { format_valid: null, ocr_agreement: null, ocr_agreement_ratio: null, business_rule_valid: null, notes: [] },
      bounding_box: null,
    };
  }
  return fields;
}
