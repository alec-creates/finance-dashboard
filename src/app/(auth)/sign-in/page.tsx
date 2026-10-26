import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in · Finance Dashboard" };

export default function SignInPage() {
  return (
    <AuthCard
      title="Sign in"
      description="Finance Dashboard is private. Only the owner can sign in."
    >
      <SignInForm />
    </AuthCard>
  );
}
