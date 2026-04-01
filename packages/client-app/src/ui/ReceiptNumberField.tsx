import { Field } from "@elb/ui/forms";
import { getFieldInputClassName } from "./formSupport";

export function ReceiptNumberField(props: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Field label="ELB-Nummer">
      <input
        className={getFieldInputClassName(props.value)}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
      />
    </Field>
  );
}
