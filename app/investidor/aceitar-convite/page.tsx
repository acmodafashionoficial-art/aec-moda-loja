import { InvestorPasswordForm } from "@/components/investor-password-form";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function InvestorInvitePage({ searchParams }: Props) {
  const params = await searchParams;
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const inviteToken = String(rawToken || "").trim();
  return <InvestorPasswordForm mode="invite" inviteToken={inviteToken} />;
}
