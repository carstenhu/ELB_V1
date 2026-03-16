import type { ReactNode } from "react";

export function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      {props.title ? (
        <div className="section__header">
          <h2>{props.title}</h2>
        </div>
      ) : null}
      <div className="section__content">{props.children}</div>
    </section>
  );
}

export function Field(props: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`field${props.full ? " field--full" : ""}`}>
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}
