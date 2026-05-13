"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function IntegracionesPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/integraciones/notion"); }, []);
  return null;
}
