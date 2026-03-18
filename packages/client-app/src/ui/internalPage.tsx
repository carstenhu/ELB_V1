import { type CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { useCaseEditorActions } from "../features/caseEditor/useCaseEditorActions";
import { useAppState } from "../useAppState";

export function InternalPage(props: { caseFile: CaseFile }) {
  const state = useAppState();
  const actions = useCaseEditorActions(props.caseFile);

  return (
    <div className="page-grid">
      <Section title="Interne Infos">
        <Field label="Interne Notizen" full>
          <textarea value={props.caseFile.internalInfo.notes} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, internalInfo: { ...current.internalInfo, notes: event.target.value } }))} />
        </Field>
      </Section>
      <Section title="Interessengebiete">
        <div className="chip-flow">
          {state.masterData.departments.map((department) => {
            const checked = props.caseFile.internalInfo.interestDepartmentIds.includes(department.id);
            return (
              <label key={department.id} className="checkbox-line">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    actions.updateCurrentCase((current) => ({
                      ...current,
                      internalInfo: {
                        ...current.internalInfo,
                        interestDepartmentIds: event.target.checked
                          ? [...current.internalInfo.interestDepartmentIds, department.id]
                          : current.internalInfo.interestDepartmentIds.filter((id) => id !== department.id)
                      }
                    }))
                  }
                />
                <span>
                  {department.code} · {department.name}
                </span>
              </label>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
