import { Link } from "@tanstack/react-router";

export function PersonLink({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <Link
      to="/person/$personId"
      params={{ personId: id }}
      className={className ?? "text-primary underline-offset-2 hover:underline"}
    >
      {name}
    </Link>
  );
}
