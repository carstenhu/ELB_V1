# Exporte

## Artefakte

- `payload.json`
- `metadata.json`
- `elb.pdf`
- `zusatz.pdf`
- `schaetzliste.docx`
- `schaetzliste.pdf`
- `bilder/manifest.json`
- ZIP-Bundle

## Technische Entscheidungen

- Exportpayloads werden als versionierter Envelope gespeichert
- PDF- und Vorschaupfad teilen sich dieselbe Renderlogik
- `Angaben folgen` wird im ELB-PDF und in der PDF-Vorschau rot gerendert

## Fragile Stellen

- Template-Feldnamen in PDF/DOCX sind weiterhin eng an Vorlagen gebunden
- Änderungen an `template.pdf`, `template_objekte.pdf` oder `Koller_sl_de.docx` sollten durch Snapshot- oder Integrationstests abgesichert werden
