-- Issuing an invoice, and moving one through its lifecycle.
--
-- The finance page kept its ledger in browser state. "Gönder" and "Öde" set a
-- field on a local object and called save(); an invoice marked paid was paid in
-- one browser and nowhere else. Invoice numbers were generated client-side from
-- a hash of the site id, so two admins cutting invoices at the same moment
-- would have produced the same number for different documents.
--
-- Identity and integrity belong to the server; the amount belongs to the admin.
-- That is the split here: the RPC decides the customer, the code and whether
-- this period has already been billed, and refuses to be told any of them. It
-- does not second-guess the figure an admin chooses to invoice.

-- The period an invoice covers. Without it there is no way to say "this site's
-- July is already billed", which is the single most valuable thing to be able
-- to refuse.
alter table invoices
  add column if not exists period_start date,
  add column if not exists period_end   date;

-- One live invoice per site per period. A cancelled invoice is excluded, so a
-- mistake can be voided and the period re-issued.
create unique index if not exists invoices_site_period_uniq
  on invoices (org_id, site_id, period_start, period_end)
  where site_id is not null and period_start is not null and status <> 'cancelled';


create or replace function issue_invoice(
  p_site          uuid,
  p_period_start  date,
  p_period_end    date,
  p_amount        numeric,
  p_labor_cost    numeric,
  p_chemical_cost numeric,
  p_description   text,
  p_due_days      int default 30
) returns invoices
language plpgsql security definer set search_path = public as $fn$
declare
  s          sites;
  year_part  text;
  next_seq   int;
  new_code   text;
  result     invoices;
  attempt    int := 0;
begin
  select * into s from sites where id = p_site;
  if s.id is null then
    raise exception 'Saha bulunamadı.';
  end if;
  if s.org_id <> app_org_id() or not app_is_admin() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Fatura tutarı sıfırdan büyük olmalıdır.';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Fatura dönemi geçersiz.';
  end if;

  -- The customer is read from the site, never accepted from the caller: an
  -- invoice filed against the wrong customer becomes visible to that customer
  -- under inv_client_read.
  if s.customer_id is null then
    raise exception 'Bu sahanın bağlı olduğu müşteri tanımlı değil.';
  end if;

  year_part := to_char(p_period_end, 'YYYY');

  -- Sequence per org per year. Two admins issuing at the same instant can pick
  -- the same number; unique (org_id, code) rejects the loser, so the retry is
  -- what actually makes this safe rather than the select.
  loop
    attempt := attempt + 1;
    select coalesce(max(substring(code from '^FTR-\d{4}-(\d+)$')::int), 0) + 1
      into next_seq
      from invoices
     where org_id = s.org_id
       and code like 'FTR-' || year_part || '-%';

    new_code := 'FTR-' || year_part || '-' || lpad(next_seq::text, 4, '0');

    begin
      insert into invoices (
        org_id, customer_id, site_id, code, description,
        issued_on, due_on, period_start, period_end,
        amount, labor_cost, chemical_cost, status
      ) values (
        s.org_id, s.customer_id, p_site, new_code, nullif(p_description, ''),
        current_date, current_date + coalesce(p_due_days, 30),
        p_period_start, p_period_end,
        p_amount, p_labor_cost, p_chemical_cost, 'draft'
      ) returning * into result;
      return result;
    exception
      when unique_violation then
        -- Either the code was taken (retry with the next number) or this
        -- period is already invoiced (a retry would loop forever, so say so).
        if exists (select 1 from invoices
                    where org_id = s.org_id and site_id = p_site
                      and period_start = p_period_start and period_end = p_period_end
                      and status <> 'cancelled') then
          raise exception 'Bu saha için bu dönem zaten faturalandırılmış.';
        end if;
        if attempt >= 5 then
          raise exception 'Fatura numarası atanamadı, lütfen tekrar deneyin.';
        end if;
    end;
  end loop;
end $fn$;

revoke all on function issue_invoice(uuid, date, date, numeric, numeric, numeric, text, int) from public, anon;
grant execute on function issue_invoice(uuid, date, date, numeric, numeric, numeric, text, int) to authenticated;


-- Lifecycle. The transitions are the point: a paid invoice is the end of the
-- line, and nothing may walk it backwards to draft to be quietly re-edited.
create or replace function set_invoice_status(p_invoice uuid, p_status invoice_status)
returns invoices
language plpgsql security definer set search_path = public as $fn$
declare
  inv    invoices;
  result invoices;
begin
  select * into inv from invoices where id = p_invoice;
  if inv.id is null then
    raise exception 'Fatura bulunamadı.';
  end if;
  if inv.org_id <> app_org_id() or not app_is_admin() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if inv.status = p_status then
    raise exception 'Fatura zaten bu durumda.';
  end if;

  if not (
       (inv.status = 'draft'   and p_status in ('sent', 'cancelled'))
    or (inv.status = 'sent'    and p_status in ('paid', 'overdue', 'cancelled'))
    or (inv.status = 'overdue' and p_status in ('paid', 'cancelled'))
  ) then
    raise exception 'Bu durum değişikliği yapılamaz (% -> %).', inv.status, p_status;
  end if;

  update invoices
     set status  = p_status,
         paid_at = case when p_status = 'paid' then now() else paid_at end
   where id = p_invoice
   returning * into result;

  return result;
end $fn$;

revoke all on function set_invoice_status(uuid, invoice_status) from public, anon;
grant execute on function set_invoice_status(uuid, invoice_status) to authenticated;
