import { notFound, redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { VoiceRoom } from "@/components/voice-room";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!room) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const role =
    room.buyer_id === user.id
      ? "Buyer"
      : room.seller_id === user.id
        ? "Seller"
        : "Observer";

  return (
    <>
      <TopNav
        name={profile?.name ?? "Trader"}
        back={{ href: "/dashboard", label: "Dashboard" }}
      />
      <VoiceRoom
        roomId={room.id}
        code={room.code}
        title={room.title}
        role={role}
        selfId={user.id}
        initialBuyerId={room.buyer_id}
        initialSellerId={room.seller_id}
      />
    </>
  );
}
