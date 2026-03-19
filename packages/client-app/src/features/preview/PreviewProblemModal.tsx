export interface PreviewProblemDetails {
  title: string;
  message: string;
  reasons: string[];
}

export function PreviewProblemModal(props: {
  problem: PreviewProblemDetails;
  onClose: () => void;
}) {
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
