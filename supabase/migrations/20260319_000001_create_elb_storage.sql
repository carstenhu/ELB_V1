insert into storage.buckets (id, name, public)
values ('elb-v1-data', 'elb-v1-data', false)
on conflict (id) do nothing;

create policy "elb anon read objects"
on storage.objects
for select
to anon
using (bucket_id = 'elb-v1-data');

create policy "elb anon insert objects"
on storage.objects
for insert
to anon
with check (bucket_id = 'elb-v1-data');

create policy "elb anon update objects"
on storage.objects
for update
to anon
using (bucket_id = 'elb-v1-data')
with check (bucket_id = 'elb-v1-data');

create policy "elb anon delete objects"
on storage.objects
for delete
to anon
using (bucket_id = 'elb-v1-data');
