-- Chemical application and the stock movement it causes, in one transaction.
--
-- Recording that a technician applied a product is three writes: the usage
-- itself, a stock movement, and the decrement on the stock item. The office UI
-- used to do the equivalent against browser state — `deductStock()` mutated a
-- seeded array — so nothing was ever accounted for.
--
-- Doing it as three separate PostgREST calls would be worse than the old
-- behaviour in one specific way: a failure between them leaves the books
-- wrong, and stock records are exactly where a silent half-write is expensive.
-- An RPC keeps all three atomic.

create or replace function record_chemical_usage(
  p_work_order uuid,
  p_chemical   uuid,
  p_quantity   numeric,
  p_unit       text,
  p_area       text,
  p_notes      text
) returns chemical_usages
language plpgsql security definer set search_path = public as $fn$
declare
  w    work_orders;
  item inventory_items;
  use_row chemical_usages;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalıdır.';
  end if;

  select * into w from work_orders where id = p_work_order;
  if w.id is null then
    raise exception 'İş emri bulunamadı.';
  end if;
  if w.org_id <> app_org_id() or not app_is_staff() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if not exists (select 1 from chemicals c
                 where c.id = p_chemical and c.org_id = w.org_id and c.is_active) then
    raise exception 'Kimyasal bulunamadı veya kullanım dışı.';
  end if;

  insert into chemical_usages (
    org_id, site_id, work_order_id, chemical_id, technician_id,
    quantity, unit, area_desc, notes
  ) values (
    w.org_id, w.site_id, p_work_order, p_chemical, w.technician_id,
    p_quantity, p_unit, nullif(p_area, ''), nullif(p_notes, '')
  ) returning * into use_row;

  -- Draw from the oldest usable lot first, so stock rotates and a lot that is
  -- about to expire is consumed before a fresh one.
  select * into item
    from inventory_items
   where org_id = w.org_id and chemical_id = p_chemical and qty > 0
   order by expires_on nulls last, created_at
   limit 1;

  if item.id is not null then
    update inventory_items
       set qty = greatest(0, qty - p_quantity)
     where id = item.id;

    insert into inventory_transactions (org_id, item_id, type, qty, unit, notes, created_by)
    values (w.org_id, item.id, 'consume', p_quantity, p_unit,
            'İş emri ' || w.code, auth.uid());
  end if;
  -- No stock row is not an error: an org can record what was applied before it
  -- has taken that product into stock. The usage is still the fact of record.

  return use_row;
end $fn$;

revoke all on function record_chemical_usage(uuid, uuid, numeric, text, text, text) from public, anon;
grant execute on function record_chemical_usage(uuid, uuid, numeric, text, text, text) to authenticated;


-- Taking stock in. Same reasoning: the movement and the balance must agree.
create or replace function restock_inventory(
  p_item  uuid,
  p_qty   numeric,
  p_notes text
) returns inventory_items
language plpgsql security definer set search_path = public as $fn$
declare item inventory_items;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalıdır.';
  end if;

  select * into item from inventory_items where id = p_item;
  if item.id is null then
    raise exception 'Stok kalemi bulunamadı.';
  end if;
  if item.org_id <> app_org_id() or not app_is_admin() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  update inventory_items set qty = qty + p_qty where id = p_item returning * into item;

  insert into inventory_transactions (org_id, item_id, type, qty, unit, notes, created_by)
  values (item.org_id, p_item, 'refill', p_qty, item.unit, nullif(p_notes, ''), auth.uid());

  return item;
end $fn$;

revoke all on function restock_inventory(uuid, numeric, text) from public, anon;
grant execute on function restock_inventory(uuid, numeric, text) to authenticated;
