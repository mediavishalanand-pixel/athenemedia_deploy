import { createFileRoute, redirect } from "@tanstack/react-router";

// Keeps /login working as an alias of the existing staff sign-in page.
export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log In — Athene Advertising" },
      { name: "description", content: "Log in to the Athene Advertising production desk." },
      { property: "og:title", content: "Log In — Athene Advertising" },
      { property: "og:description", content: "Log in to the Athene Advertising production desk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/auth", replace: true });
  },
  component: () => null,
});
