import type { CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { useAppState } from "../../useAppState";
import { getTextInputClassName } from "../../ui/formSupport";
import { getPreviewFieldValue, updatePreviewFieldValue, type PreviewEditableFieldIssue } from "./previewProblemFields";
import type { PreviewProblemDetails } from "./usePreviewActions";

export function PreviewProblemModal(props: {
  caseFile: CaseFile;
  problem: PreviewProblemDetails;
  onClose: () => void;
}) {
  const state = useAppState();

  function renderEditableField(issue: PreviewEditableFieldIssue) {
    const value = getPreviewFieldValue(props.caseFile, issue.path);

    if (issue.path === "meta.clerkId") {
      return (
        <Field key={issue.path} label={issue.label} full>
          <select value={value} onChange={(event) => updatePreviewFieldValue(issue.path, event.target.value)}>
            <option value="">Bitte waehlen</option>
            {state.masterData.clerks.map((clerk) => (
              <option key={clerk.id} value={clerk.id}>
                {clerk.name}
              </option>
            ))}
          </select>
          <small>{issue.message}</small>
        </Field>
      );
    }

    if (issue.path.match(/^objects\.\d+\.departmentId$/)) {
      return (
        <Field key={issue.path} label={issue.label} full>
          <select value={value} onChange={(event) => updatePreviewFieldValue(issue.path, event.target.value)}>
            <option value="">Bitte waehlen</option>
            {state.masterData.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.code} - {department.name}
              </option>
            ))}
          </select>
          <small>{issue.message}</small>
        </Field>
      );
    }

    if (issue.path.match(/^objects\.\d+\.auctionId$/)) {
      return (
        <Field key={issue.path} label={issue.label} full>
          <select value={value} onChange={(event) => updatePreviewFieldValue(issue.path, event.target.value)}>
            <option value="">Bitte waehlen</option>
            {state.masterData.auctions.map((auction) => (
              <option key={auction.id} value={auction.id}>
                {auction.number} {auction.month}/{auction.year.slice(-2)}
              </option>
            ))}
          </select>
          <small>{issue.message}</small>
        </Field>
      );
    }

    return (
      <Field key={issue.path} label={issue.label} full>
        <input className={getTextInputClassName(value)} value={value} onChange={(event) => updatePreviewFieldValue(issue.path, event.target.value)} />
        <small>{issue.message}</small>
      </Field>
    );
  }

  return (
    <div className="pin-modal">
      <div className="overlay__card">
        <div className="admin-header">
          <h2>{props.problem.title}</h2>
          <button onClick={props.onClose}>Schliessen</button>
        </div>
        <div className="page-grid">
          <div className="preview-card">
            <p>{props.problem.message}</p>
            {props.problem.fields.length ? (
              <Section title="Fehler direkt korrigieren">
                {props.problem.fields.map((issue) => renderEditableField(issue))}
              </Section>
            ) : null}
            {props.problem.reasons.length ? (
              <>
                <h3>Gruende</h3>
                <ul className="simple-list">
                  {props.problem.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
