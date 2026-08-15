# Migrations

The full Aegis schema is already applied to the Supabase project `Aegis`
(`amypafeuuqahdzsnbnte`) and versioned there:

| Version          | Migration                           |
| ---------------- | ----------------------------------- |
| 20260815071949   | `aegis_core_enums_and_identity`     |
| 20260815072015   | `aegis_rooms_contracts_ledger`      |
| 20260815072041   | `aegis_forensics_vision_jury_reels` |
| 20260815072132   | `aegis_escrow_settlement_functions` |
| 20260815072203   | `aegis_rls_and_realtime`            |
| 20260815072219   | `aegis_storage_work_proofs`         |
| 20260815072312   | `aegis_harden_function_surface`     |

To materialise the `.sql` files into this directory, link the project and pull.
Both commands need your own Supabase credentials, so run them yourself:

```bash
supabase link --project-ref amypafeuuqahdzsnbnte && supabase db pull
```

After that, `supabase db reset` reproduces the entire schema from scratch on a
local stack.
