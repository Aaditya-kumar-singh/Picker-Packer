alter table public.order_items
  add column if not exists product_type text not null default 'STANDARD';

create table if not exists public.packing_confirmations (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references public.orders(id) on delete cascade,
  item_id text not null references public.order_items(id) on delete cascade,
  packer_id uuid not null references public.users(id),
  product_name text not null,
  product_type text not null,
  product_barcode text not null,
  expected_qty integer not null check (expected_qty > 0),
  confirmed_qty integer not null check (confirmed_qty > 0),
  condition text not null default 'GOOD' check (condition in ('GOOD','DAMAGED','OTHER')),
  created_at timestamptz not null default now(),
  unique(order_id, item_id, packer_id, created_at)
);

create index if not exists packing_confirmations_order_idx
  on public.packing_confirmations(order_id, item_id, created_at desc);

alter table public.packing_confirmations enable row level security;

drop policy if exists packing_confirmations_select on public.packing_confirmations;
create policy packing_confirmations_select on public.packing_confirmations
for select to authenticated
using (
  exists (
    select 1 from public.users u
    join public.orders o on o.warehouse_id = u.warehouse_id
    where u.id = auth.uid()
      and u.active = true
      and u.role = 'PACKER'
      and o.id = packing_confirmations.order_id
      and o.warehouse_id = u.warehouse_id
  )
);

revoke all on public.packing_confirmations from anon, authenticated;

create or replace function public.packer_confirm_item(
  p_order_id text, p_item_id text, p_product_name text, p_product_type text,
  p_product_barcode text, p_confirmed_qty integer, p_condition text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user public.users;
  v_order public.orders;
  v_item public.order_items;
  v_expected_barcode text;
begin
  select * into v_user from public.users where id=auth.uid() and active=true;
  if v_user.id is null or v_user.role <> 'PACKER' then raise exception 'Packer access required'; end if;
  if p_confirmed_qty <= 0 then raise exception 'Confirmed quantity must be positive'; end if;
  if upper(trim(coalesce(p_condition,''))) not in ('GOOD','DAMAGED','OTHER') then raise exception 'Invalid item condition'; end if;

  if exists (
    select 1 from public.idempotency_keys
    where key=p_idempotency_key and user_id=auth.uid() and operation='packer_confirm_item'
  ) then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null or v_order.warehouse_id<>v_user.warehouse_id
     or v_order.status<>'PACKING' or v_order.packer_id is distinct from auth.uid()
  then raise exception 'Order is not available for packing'; end if;

  select * into v_item from public.order_items where id=p_item_id and order_id=p_order_id for update;
  if v_item.id is null then raise exception 'Item not found'; end if;

  v_expected_barcode := coalesce(v_item.sku_barcode,v_item.sku);

  if upper(trim(coalesce(p_product_name,''))) <> upper(trim(v_item.product_name))
    then raise exception 'Product does not match order item'; end if;
  if upper(trim(coalesce(p_product_type,''))) <> upper(trim(v_item.product_type))
    then raise exception 'Product type does not match'; end if;
  if upper(trim(coalesce(p_product_barcode,''))) <> upper(trim(v_expected_barcode))
    then raise exception 'Product barcode does not match'; end if;
  if p_confirmed_qty > (v_item.picked_qty-v_item.packed_qty)
    then raise exception 'Confirmed quantity exceeds remaining picked quantity'; end if;

  insert into public.packing_confirmations(
    order_id,item_id,packer_id,product_name,product_type,product_barcode,
    expected_qty,confirmed_qty,condition
  ) values (
    p_order_id,p_item_id,auth.uid(),v_item.product_name,v_item.product_type,
    v_expected_barcode,v_item.picked_qty-v_item.packed_qty,p_confirmed_qty,
    upper(trim(p_condition))
  );

  update public.order_items set packed_qty=packed_qty+p_confirmed_qty where id=p_item_id;

  insert into public.idempotency_keys(key,user_id,operation,response_status,response_body)
  values (
    p_idempotency_key,auth.uid(),'packer_confirm_item',200,
    jsonb_build_object('itemId',p_item_id,'confirmedQty',p_confirmed_qty)::text
  ) on conflict (key) do nothing;

  return jsonb_build_object(
    'ok',true,'itemId',p_item_id,'confirmedQty',p_confirmed_qty,
    'packedQty',v_item.packed_qty+p_confirmed_qty
  );
end;
$function$;

revoke execute on function public.packer_confirm_item(text,text,text,text,text,integer,text,text) from public,anon;
grant execute on function public.packer_confirm_item(text,text,text,text,text,integer,text,text) to authenticated;
