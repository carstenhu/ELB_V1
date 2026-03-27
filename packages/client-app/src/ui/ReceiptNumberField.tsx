import { useEffect, useRef, useState } from "react";
import { Field } from "@elb/ui/forms";
import { ReceiptNumberEditConfirmModal } from "./caseModals";
import { getFieldInputClassName } from "./formSupport";

export function ReceiptNumberField(props: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const [editRequested, setEditRequested] = useState(false);
  const [editingEnabled, setEditingEnabled] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingEnabled) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingEnabled]);

  return (
    <>
      <Field label="ELB-Nummer">
        <>
          <input
            ref={inputRef}
            className={getFieldInputClassName(props.value)}
            value={props.value}
            readOnly={!editingEnabled}
            aria-readonly={!editingEnabled}
            onBlur={() => setEditingEnabled(false)}
            onClick={() => {
              if (!editingEnabled) {
                setEditRequested(true);
              }
            }}
            onFocus={() => {
              if (!editingEnabled) {
                setEditRequested(true);
                inputRef.current?.blur();
              }
            }}
            onChange={(event) => props.onValueChange(event.target.value)}
          />
          {!editingEnabled ? <p className="modal-hint">Klick ins Feld oeffnet die Freigabe mit Warnhinweis.</p> : null}
        </>
      </Field>
      {editRequested ? (
        <ReceiptNumberEditConfirmModal
          onCancel={() => setEditRequested(false)}
          onConfirm={() => {
            setEditRequested(false);
            setEditingEnabled(true);
          }}
        />
      ) : null}
    </>
  );
}
