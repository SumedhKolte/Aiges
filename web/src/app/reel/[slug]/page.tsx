import { notFound } from "next/navigation";
import { ReelPlayer } from "@/components/reel-player";

export const dynamic = "force-dynamic";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Reel = {
  share_slug: string;
  headline: string;
  scenes: { key: string; label: string; caption: string; value: string }[];
  freelancer: string;
  trust_score: number;
  deals_closed: number;
};

export default async function ReelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const res = await fetch(`${API}/reels/${slug}`, { cache: "no-store" }).catch(
    () => null,
  );
  if (!res?.ok) notFound();

  const reel: Reel = await res.json();

  return <ReelPlayer reel={reel} />;
}
