import type { Metadata } from "next";
import { SignupForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Online Enrollment — FMB" };

export default function SignupPage() {
  return <SignupForm />;
}
