import { notFound, redirect } from "next/navigation";
import { ContractWorkspace } from "@/components/contract-workspace";
import { TopNav } from "@/components/top-nav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!contract) notFound();

  const [{ data: profile }, { data: counterparty }] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    supabase
      .from("profiles")
      .select("name, trust_score")
      .eq(
        "id",
        contract.buyer_id === user.id ? contract.seller_id : contract.buyer_id,
      )
      .maybeSingle(),
  ]);

  return (
    <>
      <TopNav
        name={profile?.name ?? "Trader"}
        back={{ href: "/dashboard", label: "Dashboard" }}
      />
      <ContractWorkspace
        contract={contract}
        isSeller={contract.seller_id === user.id}
        counterpartyName={counterparty?.name ?? "The other party"}
        counterpartyTrust={counterparty?.trust_score ?? 100}
      />
    </>
  );
}
