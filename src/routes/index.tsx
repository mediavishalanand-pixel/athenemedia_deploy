import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Athene Advertising — Production Desk" },
      { name: "description", content: "Staff access to Athene Advertising's production desk." },
      { property: "og:title", content: "Athene Advertising — Production Desk" },
      { property: "og:description", content: "Staff access to Athene Advertising's production desk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
});