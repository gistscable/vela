import type { Metadata } from "next";
import { LoginForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Sign In to Online Banking — FMB" };

export default function LoginPage() {
  return <LoginForm />;
}
