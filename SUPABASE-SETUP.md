# Supabase Setup

Die Web-App kann den Workspace optional online nach Supabase spiegeln. Lokal wird weiterhin sofort gespeichert; mit Supabase schreibt die Web-App denselben Stand zusaetzlich in einen Storage-Bucket.

## Env

In `apps/web/.env.local`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_BUCKET=elb-v1-data
```

Alternativ wird auch `VITE_SUPABASE_ANON_KEY` akzeptiert.

## Bucket

In Supabase einen Storage-Bucket mit dem Namen `elb-v1-data` anlegen oder `VITE_SUPABASE_BUCKET` entsprechend setzen.

Die Web-App schreibt dort unter anderem:

- `workspace.json`
- `Stammdaten/master-data.json`
- `Sachbearbeiter/<name>/Aktuell/session.json`
- `Sachbearbeiter/<name>/Aktuell/assets/optimized/...`

## Policies

Fuer den ersten internen Test ohne Login braucht der Bucket Schreib- und Leserechte fuer die Web-App. Das ist funktional, aber noch nicht fuer einen oeffentlichen Rollout gedacht.

Beispiel fuer einen internen Bootstrap:

```sql
create policy "anon can read elb bucket"
on storage.objects
for select
to anon
using (bucket_id = 'elb-v1-data');

create policy "anon can write elb bucket"
on storage.objects
for insert
to anon
with check (bucket_id = 'elb-v1-data');

create policy "anon can update elb bucket"
on storage.objects
for update
to anon
using (bucket_id = 'elb-v1-data')
with check (bucket_id = 'elb-v1-data');
```

## Verhalten

- Ohne Supabase-Env bleibt die Web-App bei lokaler Browser-/Ordnerspeicherung.
- Mit Supabase-Env:
  - `load()` liest zuerst online und faellt bei Fehlern lokal zurueck.
  - `save()` speichert zuerst lokal und spiegelt dann online.
  - optimierte Fotos werden zusaetzlich im Bucket gespeichert.

## Naechster Sicherheits-Schritt

Vor produktivem Mehrbenutzerbetrieb sollte Auth eingefuehrt und die Storage-Policies auf `authenticated` umgestellt werden, statt den Bucket fuer `anon` offen zu lassen.
