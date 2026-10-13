import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Le Comptoir GPS", template: "%s · Le Comptoir GPS" },
  robots: { index: false, follow: false, nocache: true },
};

export default function ComptoirRoot({ children }: LayoutProps<"/comptoir">) {
  return <div className="bg-paper min-h-dvh">{children}</div>;
}
