import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AccountNotFound() {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>
          <h1>Account not found</h1>
        </CardTitle>
        <CardDescription>
          It may have been deleted, or the link is wrong.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href="/accounts">Back to accounts</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
