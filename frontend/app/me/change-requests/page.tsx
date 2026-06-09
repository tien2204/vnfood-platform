"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MyChangeRequestsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/staff/proposals"); }, [router]);
  return <p className="p-8 text-muted-foreground">Đang chuyển hướng…</p>;
}
