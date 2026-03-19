/* eslint-disable react-refresh/only-export-components */
import { normalizeIntNumberInput, parseAmountNumber } from "@elb/domain/index";
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export const FOLLOW_UP_VALUE = "Angaben folgen";

export const VAT_CATEGORY_OPTIONS = [
  { value: "", label: "Bitte wählen" },
  { value: "A", label: "A - Privat Schweiz" },
  { value: "B", label: "B - Ausland" },
  { value: "C", label: "C - Händler Schweiz" }
] as const;

export const COUNTRY_SUGGESTIONS = [
  "Schweiz",
  "Deutschland",
  "Oesterreich",
  "Liechtenstein",
  "Frankreich",
  "Italien",
  "Spanien",
  "Vereinigtes Koenigreich",
  "USA",
  "Andere"
] as const;

export function normalizeFieldValue(value: string | null | undefined) {
  return typeof value === "string" ? value : "";
}

export function isFollowUpValue(value: string | null | undefined) {
  return normalizeFieldValue(value).trim() === FOLLOW_UP_VALUE;
}

export function getFieldInputClassName(value: string | null | undefined) {
  return isFollowUpValue(value) ? "field-input field-input--follow-up" : "field-input";
}

export function getTextInputClassName(value: string | null | undefined) {
  return getFieldInputClassName(value);
}

export function getFieldInputStateClassName(value: string | null | undefined, issue: string | null | undefined) {
  const baseClassName = getFieldInputClassName(value);
  return issue ? `${baseClassName} field-input--error` : baseClassName;
}

export function normalizeIntNumberFieldValue(value: string) {
  return normalizeIntNumberInput(value);
}

export function getEstimateRangeIssue(low: string, high: string): string {
  const lowValue = parseAmountNumber(low);
  const highValue = parseAmountNumber(high);

  if (lowValue === null || highValue === null || highValue >= lowValue) {
    return "";
  }

  return "Obere Schaetzung muss gleich gross oder groesser als die untere Schaetzung sein.";
}

export function renderFollowUpOption(value: string | null | undefined) {
  return isFollowUpValue(value) ? <option value={FOLLOW_UP_VALUE}>{FOLLOW_UP_VALUE}</option> : null;
}

export function SignaturePadEditor(props: { value: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [draftValue, setDraftValue] = useState(props.value);

  useEffect(() => {
    setDraftValue(props.value);
  }, [props.value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#111111";

    if (!draftValue) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = draftValue;
  }, [draftValue]);

  function getCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getCanvasPoint(event);
    if (!canvas || !context || !point) {
      return;
    }

    isDrawingRef.current = true;
    lastPointRef.current = point;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) {
      return;
    }

    const context = canvasRef.current?.getContext("2d");
    const point = getCanvasPoint(event);
    const lastPoint = lastPointRef.current;
    if (!context || !point || !lastPoint) {
      return;
    }

    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
  }

  function end(event?: ReactPointerEvent<HTMLCanvasElement>) {
    if (event && canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setDraftValue("");
    props.onChange("");
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    setDraftValue(dataUrl);
    props.onChange(dataUrl);
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        className="signature-pad__canvas"
        width={640}
        height={220}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="signature-pad__actions">
        <button type="button" className="secondary-button" onClick={clear}>
          Löschen
        </button>
        <button type="button" className="primary-button" onClick={save}>
          Übernehmen
        </button>
      </div>
    </div>
  );
}

export function InlineToggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-toggle">
      <span className="inline-toggle__label">{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span className="inline-toggle__box" aria-hidden="true" />
    </label>
  );
}

export function CountryInput(props: { value: string; onChange: (value: string) => void; className?: string }) {
  const listId = useId();

  return (
    <>
      <input className={props.className} list={listId} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      <datalist id={listId}>
        {COUNTRY_SUGGESTIONS.map((country) => (
          <option key={country} value={country} />
        ))}
      </datalist>
    </>
  );
}

export function FollowUpFieldControl(props: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="follow-up-toggle">
      <input
        type="checkbox"
        checked={isFollowUpValue(props.value)}
        onChange={(event) => props.onChange(event.target.checked ? FOLLOW_UP_VALUE : "")}
      />
      <span>Angaben folgen</span>
    </label>
  );
}
