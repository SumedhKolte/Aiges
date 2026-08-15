-- Irreversible money actions must be enforced by the database, not a prompt
-- or a browser. The service role is the sole caller of these functions.

create table if not exists public.room_term_consents (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_hash text not null check (char_length(terms_hash) = 64),
  accepted_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_term_consents_hash_idx
  on public.room_term_consents (room_id, terms_hash);

alter table public.room_term_consents enable row level security;
revoke all on public.room_term_consents from anon, authenticated;

create table if not exists public.delivery_acceptances (
  contract_id uuid primary key references public.contracts(id) on delete cascade,
  verification_id uuid not null references public.verifications(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz not null default now()
);

alter table public.delivery_acceptances enable row level security;
revoke all on public.delivery_acceptances from anon, authenticated;

create or replace function public.create_and_lock_escrow(
  p_room_id uuid,
  p_item_description text,
  p_price_cents bigint,
  p_release_condition text,
  p_risk_score integer,
  p_terms_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_contract_id uuid;
  v_consent_count integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Negotiation room not found' using errcode = 'P0002';
  end if;

  if v_room.status <> 'NEGOTIATING' then
    raise exception 'Room is not available for escrow' using errcode = 'P0001';
  end if;
  if v_room.buyer_id is null or v_room.seller_id is null
     or v_room.buyer_id = v_room.seller_id then
    raise exception 'Two distinct parties are required' using errcode = 'P0001';
  end if;

  select count(*) into v_consent_count
  from public.room_term_consents
  where room_id = p_room_id
    and terms_hash = p_terms_hash
    and user_id in (v_room.buyer_id, v_room.seller_id);
  if v_consent_count <> 2 then
    raise exception 'Authenticated acceptance from both parties is required'
      using errcode = 'P0001';
  end if;

  insert into public.contracts (
    room_id, buyer_id, seller_id, item_description, price_cents,
    release_condition, risk_score, status
  ) values (
    p_room_id, v_room.buyer_id, v_room.seller_id, p_item_description,
    p_price_cents, p_release_condition, p_risk_score, 'NEGOTIATING'
  ) returning id into v_contract_id;

  -- lock_escrow performs the wallet mutation. This function runs in one
  -- transaction, so an error rolls back both the new contract and room lock.
  perform public.lock_escrow(v_contract_id);
  update public.rooms set status = 'SEALED' where id = p_room_id;
  return v_contract_id;
end;
$$;

create or replace function public.accept_and_release_escrow(
  p_contract_id uuid,
  p_verification_id uuid,
  p_buyer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.contracts%rowtype;
  v_approved boolean;
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if not found then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;
  if v_contract.buyer_id <> p_buyer_id then
    raise exception 'Only the Buyer may accept delivery' using errcode = 'P0001';
  end if;
  if v_contract.status not in ('LOCKED', 'PENDING_VERIFICATION') then
    raise exception 'Contract is not awaiting delivery acceptance' using errcode = 'P0001';
  end if;

  select approved into v_approved
  from public.verifications
  where id = p_verification_id and contract_id = p_contract_id;
  if v_approved is distinct from true then
    raise exception 'Only an approved verification can be accepted' using errcode = 'P0001';
  end if;

  insert into public.delivery_acceptances (contract_id, verification_id, buyer_id)
  values (p_contract_id, p_verification_id, p_buyer_id);
  perform public.release_escrow(p_contract_id);
  return p_contract_id;
end;
$$;

revoke all on function public.create_and_lock_escrow(uuid, text, bigint, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.accept_and_release_escrow(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_and_lock_escrow(uuid, text, bigint, text, integer, text)
  to service_role;
grant execute on function public.accept_and_release_escrow(uuid, uuid, uuid)
  to service_role;
