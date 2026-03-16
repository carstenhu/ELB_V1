# Variablenübersicht

Diese Datei dokumentiert die im Projekt verwendeten fachlichen Variablen, gruppiert nach Bereich.

## 1. Allgemein / Meta

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `meta.receipt_no` | Allgemein | String | ELB-Nummer |
| `meta.clerk` | Allgemein | String | Sachbearbeiter |
| `meta.date` | Allgemein | String/Datum | Erfassungsdatum |

## 2. Einlieferer

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `person.capture_company_address` | Adresse | Bool | Firmenadresse statt Privatadresse |
| `person.customer_no` | Adresse | String | Kundennummer |
| `person.company` | Adresse | String | Firma |
| `person.title` | Adresse | String | Anrede |
| `person.first_name` | Adresse | String | Vorname |
| `person.name` | Adresse | String | Nachname |
| `person.address_addon1` | Adresse | String | Adresszusatz |
| `person.street` | Adresse | String | Strasse |
| `person.house_no` | Adresse | String | Hausnummer |
| `person.zip` | Adresse | String | PLZ |
| `person.city` | Adresse | String | Stadt |
| `person.country` | Adresse | String | Land |
| `person.email` | Adresse | String | E-Mail |
| `person.phone` | Adresse | String | Telefon |
| `person.birthdate` | Einlieferer | String | Geburtsdatum |
| `person.nationality` | Einlieferer | String | Nationalität |
| `person.passport_no` | Einlieferer | String | ID-/Passnummer |

## 3. Optionen / Einliefererstatus

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `options.main_action` | Startseite | String | `continue`, `new`, `load`, `admin`, `reset` |
| `options.capture_consignor` | Einlieferer | String | Einliefererdaten erfassen |
| `options.capture_bank_costs` | Bank/Konditionen | String | Bank- und Konditionsdaten erfassen |
| `options.einlieferer_type` | Einlieferer | String | `A`, `B`, `C` |
| `options.mwst_nr` | Einlieferer | String | MwSt.-Nr. |

## 4. Eigentümer

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `owner.same_as_consignor` | Eigentümer | String/Bool | Eigentümer = Einlieferer |
| `owner.first_name` | Eigentümer | String | Vorname |
| `owner.name` | Eigentümer | String | Nachname |
| `owner.street` | Eigentümer | String | Strasse |
| `owner.house_no` | Eigentümer | String | Hausnummer |
| `owner.zip` | Eigentümer | String | PLZ |
| `owner.city` | Eigentümer | String | Stadt |
| `owner.country` | Eigentümer | String | Land |

## 5. Bank

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `bank.beneficiary` | Bank | String | Begünstigter |
| `bank.iban` | Bank | String | IBAN |
| `bank.bic` | Bank | String | BIC |
| `bank.diff_beneficiary` | Bank | String | Grund abweichender Begünstigter |
| `bank.diff_beneficiary_name` | Bank | String | Name abweichender Begünstigter |
| `bank.diff_reason` | Bank | String | Freitext-Grund |

## 6. Konditionen

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `costs.kommission` | Konditionen | String | Kommission |
| `costs.versicherung` | Konditionen | String | Versicherung |
| `costs.transport` | Konditionen | String | Transport |
| `costs.abb_kosten` | Konditionen | String | Abb.-Kosten |
| `costs.kosten_expertisen` | Konditionen | String | Kosten (Expertisen etc.) |
| `costs.internet` | Konditionen | String | Internet |
| `costs.only_if_success` | Konditionen | Bool | Alle Kosten nur bei Erfolg |
| `costs.provenance` | Konditionen/Infos | Text | Diverses / Provenienz |


## 7. Objekte

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `objects[].int_no` | Objekt | String | Int.-Nr. |
| `objects[].auction` | Objekt | String | Auktion |
| `objects[].auction_month` | Objekt | String | Monat/Jahr |
| `objects[].chapters` | Objekt | Array/String | Kapitel |
| `objects[].short_desc` | Objekt | String | Kurzbeschreibung |
| `objects[].desc` | Objekt | Text | Beschreibung |
| `objects[].estimate_low` | Objekt | String | untere Schätzung |
| `objects[].estimate_high` | Objekt | String | obere Schätzung |
| `objects[].limit` | Objekt | String | Limite |
| `objects[].net_limit` | Objekt | Bool | Nettolimite |
| `objects[].abb_cost` | Objekt | String | Abb.-Kosten Objekt |
| `objects[].received` | Objekt | String | Referenznr. |
| `objects[].remarks` | Objekt | Text | Bemerkungen |

## 8. Interessengebiete

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `interests.codes` | Infos | Array | gewählte Kapitel/Interessengebiete |
| `interests.note` | Infos | Text | Zusatznotiz |

## 9. Signaturen

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `signatures.consignor_png` | Signatur | Data-URL/String | Unterschrift Einlieferer im PDF |

## 10. Sachbearbeiter-Stammdaten

| Variable | Bereich | Typ | Verwendung |
|---|---|---:|---|
| `clerks[].name` | Admin | String | Name |
| `clerks[].email` | Admin | String | E-Mail |
| `clerks[].phone` | Admin | String | Telefon |
| `clerks[].signature_png` | Admin | Data-URL/String | Koller-Unterschrift |

## 11. Weitere Stammdaten

### Auktionen

| Variable | Typ | Verwendung |
|---|---:|---|
| `auctions[].number` | String | Auktionsnummer |
| `auctions[].month` | String | Monat |
| `auctions[].year` | String | Jahr |

### Kapitel / Abteilungen

| Variable | Typ | Verwendung |
|---|---:|---|
| `departments[].code` | String | Kapitel-Code |
| `departments[].name` | String | Kapitel-Bezeichnung |

### Anreden

| Variable | Typ | Verwendung |
|---|---:|---|
| `titles[]` | String | auswählbare Anrede |
