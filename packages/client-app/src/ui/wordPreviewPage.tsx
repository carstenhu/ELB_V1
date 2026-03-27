import { lazy, Suspense, useEffect, useState } from "react";
import { type CaseFile } from "@elb/domain/index";
import { createExportPlan } from "@elb/export-core/index";
import { createPdfPreviewModel } from "@elb/pdf-core/index";
import { createWordPreviewModel, loadWordTemplateAssets } from "@elb/word-core/index";
import type { PreviewProblemDetails } from "../features/preview/usePreviewActions";
import { getRequiredFieldEntries } from "../features/preview/requiredFields";
import { useAppState } from "../useAppState";
import { ExportStatusCard } from "./ExportStatusCard";

const PreviewActionButtons = lazy(async () => {
  const module = await import("../features/preview/PreviewActionButtons");
  return { default: module.PreviewActionButtons };
});

const RequiredFieldsModal = lazy(async () => {
  const module = await import("../features/preview/RequiredFieldsModal");
  return { default: module.RequiredFieldsModal };
});

const PreviewProblemModal = lazy(async () => {
  const module = await import("../features/preview/PreviewProblemModal");
  return { default: module.PreviewProblemModal };
});

function PreviewActionsFallback() {
  return <span>Aktionen werden geladen...</span>;
}

function RequiredFieldsFallback() {
  return (
    <div className="pin-modal">
      <div className="overlay__card">
        <p>Pflichtfelder werden geladen...</p>
      </div>
    </div>
  );
}

function WordTemplatePageView(props: {
  headerImageSrc: string;
  page: ReturnType<typeof createWordPreviewModel>["pages"][number];
}) {
  const { page, headerImageSrc } = props;

  return (
    <div className="word-a4-scroll">
      <div className="word-a4-scroll__inner">
        <div className="word-preview-page word-preview-page--template">
          {headerImageSrc ? <img className="word-preview-page__header-image" src={headerImageSrc} alt="" /> : null}
          <div className="word-preview-page__top word-preview-page__top--template">
            {page.showAddress ? (
              <div className="word-address-block word-address-block--template">
                {page.addressLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : (
              <div className="word-address-block word-address-block--template word-address-block--empty" />
            )}
            <div className="word-date-block">
              <div className="word-date-block__value">{page.headerRightText}</div>
            </div>
          </div>

          <div className="word-preview-list word-preview-list--template">
            {page.rows.map((item) => (
              <article key={item.id} className="word-template-row" style={{ minHeight: `${item.heightUnits}px` }}>
                <div className="word-template-row__int">{item.intNumber}</div>
                <div className="word-template-row__photo">
                  {item.primaryPhoto ? <img src={item.primaryPhoto.src} alt={item.primaryPhoto.alt} /> : null}
                </div>
                <div className="word-template-row__text">
                  {item.renderedTitleLines.map((line, index) => (
                    <div key={`${item.id}-title-${index}`} className="word-template-row__title">
                      {line}
                    </div>
                  ))}
                  {item.renderedDetailLines.map((detail, index) => (
                    <div key={`${item.id}-detail-${index}`} className="word-template-row__line">
                      {detail}
                    </div>
                  ))}
                  <div className="word-template-row__line">{item.estimate ? `Schätzung: CHF ${item.estimate}` : "Schätzung offen"}</div>
                  {item.priceValue ? (
                    <div className="word-template-row__line word-template-row__line--accent">
                      {item.priceLabel}: CHF {item.priceValue}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="word-template-footer">
            <div>KOLLER AUKTIONEN</div>
            <div>{page.footerLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WordTemplatePreviewPage(props: {
  caseFile: CaseFile;
  exportStatus: string;
  onExportStatusChange: (value: string) => void;
}) {
  const state = useAppState();
  const model = createWordPreviewModel(props.caseFile, state.masterData);
  const pdfModel = createPdfPreviewModel(props.caseFile, state.masterData);
  const exportPlan = createExportPlan(props.caseFile);
  const requiredEntries = getRequiredFieldEntries(props.caseFile, state.masterData.globalPdfRequiredFields);
  const hasMissingRequiredFields = requiredEntries.length > 0;
  const [headerImageSrc, setHeaderImageSrc] = useState("");
  const [requiredFieldsOpen, setRequiredFieldsOpen] = useState(false);
  const [previewProblem, setPreviewProblem] = useState<PreviewProblemDetails | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadWordTemplateAssets()
      .then((assets) => {
        if (!cancelled) {
          setHeaderImageSrc(assets.headerImageSrc);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeaderImageSrc("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="preview-page preview-page--stacked preview-page--word">
      <div className="word-sheet-stack">
        {model.pages.map((page) => (
          <div key={page.pageNumber} className="word-sheet word-sheet--template">
            <header className="word-sheet__header">
              <div className="word-sheet__eyebrow">Schätzliste</div>
              <div>Koller-Vorlage</div>
            </header>
            <div className="word-sheet__body word-sheet__body--template">
              <WordTemplatePageView headerImageSrc={headerImageSrc} page={page} />
            </div>
          </div>
        ))}
        <ExportStatusCard
          className="preview-card--bottom"
          beneficiary={pdfModel.beneficiary}
          clerkLabel={pdfModel.clerkLabel}
          zipFileName={exportPlan.zipFileName}
          missingRequiredFields={requiredEntries.map((entry) => entry.label)}
          exportStatus={props.exportStatus}
          onCaptureMissing={() => setRequiredFieldsOpen(true)}
          actions={
            <Suspense fallback={<PreviewActionsFallback />}>
              <PreviewActionButtons
                caseFile={props.caseFile}
                hasMissingRequiredFields={hasMissingRequiredFields}
                onExportStatusChange={props.onExportStatusChange}
                onCaptureMissing={() => setRequiredFieldsOpen(true)}
                onPreviewProblem={setPreviewProblem}
              />
            </Suspense>
          }
        />
      </div>
      {requiredFieldsOpen ? (
        <Suspense fallback={<RequiredFieldsFallback />}>
          <RequiredFieldsModal caseFile={props.caseFile} entries={requiredEntries} onClose={() => setRequiredFieldsOpen(false)} />
        </Suspense>
      ) : null}
      {previewProblem ? (
        <Suspense fallback={<RequiredFieldsFallback />}>
          <PreviewProblemModal caseFile={props.caseFile} problem={previewProblem} onClose={() => setPreviewProblem(null)} />
        </Suspense>
      ) : null}
    </div>
  );
}
