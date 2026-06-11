"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminReviewRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/staff/review"); }, [router]);
  return null;
}
